const crypto = require('node:crypto');
const fs = require('node:fs');
const express = require('express');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const db = require('../utils/database');
const voiceManager = require('./voice-manager');

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL = 5 * 60 * 1000;
const LOG_CATEGORIES = ['general', 'moderation', 'members', 'messages', 'channels', 'roles', 'voice', 'emojis', 'levels', 'security'];
const AUTOMOD_BOOLEAN_RULES = [
  'links', 'invites', 'spam', 'duplicate', 'caps', 'emoji', 'mentions',
  'longMessages', 'longLines', 'imageSpam', 'advertisements'
];
const AUTOMOD_NUMBER_RULES = {
  spamLimit: [3, 20],
  spamWindowSeconds: [2, 60],
  duplicateLimit: [2, 5],
  duplicateWindowSeconds: [10, 3600],
  capsPercentage: [50, 100],
  emojiLimit: [3, 30],
  mentionsLimit: [2, 10],
  longMessagesLimit: [100, 4000],
  longLinesLimit: [2, 20],
  imageSpamLimit: [2, 20]
};

const sessions = new Map();
const oauthStates = new Map();
const exchangeCodes = new Map();

function createDashboardServer(client) {
  const app = express();
  const origins = new Set(
    (process.env.DASHBOARD_ORIGIN || '')
      .split(',')
      .map(value => value.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );
  const origin = [...origins].find(value => {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }) || [...origins][0] || '';
  const redirectUri = process.env.DASHBOARD_REDIRECT_URI;
  const returnUrl = process.env.DASHBOARD_RETURN_URL;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;
  const loginAttempts = new Map();

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.DASHBOARD_TRUST_PROXY === 'true' ? 1 : false);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.headers.origin && origins.has(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!req.headers.origin || !origins.has(req.headers.origin)) return res.sendStatus(403);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, ngrok-skip-browser-warning');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));

  function configReady() {
    try {
      if (!origin || !redirectUri || !clientId || !clientSecret || !(sessionSecret?.length >= 32)) return false;
      const primary = new URL(origin);
      if (primary.protocol !== 'https:' || primary.origin !== origin) return false;
      if (new URL(redirectUri).protocol !== 'https:') return false;
      const destination = new URL(returnUrl || `${origin}/dashboard.html`);
      if (destination.protocol !== 'https:' || !origins.has(destination.origin)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function sessionTokenValue(id) {
    const signature = crypto.createHmac('sha256', sessionSecret).update(id).digest('hex');
    return `${id}.${signature}`;
  }

  function readSession(req) {
    const credential = req.headers.authorization?.match(/^Bearer ([\da-f]{64}\.[\da-f]{64})$/)?.[1];
    if (!credential) return null;
    const [id, signature] = credential.split('.');
    if (!/^[\da-f]{64}$/.test(id || '') || !/^[\da-f]{64}$/.test(signature || '')) return null;
    const expected = crypto.createHmac('sha256', sessionSecret).update(id).digest();
    const actual = Buffer.from(signature, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const session = sessions.get(id);
    if (!session || session.sessionExpiresAt <= Date.now()) {
      sessions.delete(id);
      return null;
    }
    const now = Date.now();
    if (!session.apiWindow || now - session.apiWindow.startedAt >= 60_000) {
      session.apiWindow = { startedAt: now, count: 1 };
    } else if (++session.apiWindow.count > 120) {
      const error = new Error('Dashboard request limit reached. Please wait a minute and try again.');
      error.status = 429;
      throw error;
    }
    return { id, session };
  }

  function requireOrigin(req, res, next) {
    if (!req.headers.origin || !origins.has(req.headers.origin)) {
      return res.status(403).json({ error: 'This request did not come from the configured dashboard.' });
    }
    next();
  }

  function requireSession(req, res, next) {
    const found = readSession(req);
    if (!found) return res.status(401).json({ error: 'Sign in with Discord to continue.' });
    req.dashboardSession = found.session;
    req.dashboardSessionId = found.id;
    next();
  }

  async function discordRequest(path, options = {}) {
    const response = await fetch(`${DISCORD_API}${path}`, options);
    if (!response.ok) {
      const error = new Error(`Discord API request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  async function refreshAccessToken(session) {
    if (session.expiresAt > Date.now() + 60_000) return session.accessToken;
    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken
      })
    });
    if (!response.ok) {
      const error = new Error('Your Discord session expired. Sign in again.');
      error.status = 401;
      throw error;
    }
    const token = await response.json();
    session.accessToken = token.access_token;
    session.refreshToken = token.refresh_token;
    session.expiresAt = Date.now() + token.expires_in * 1000;
    return session.accessToken;
  }

  async function currentUserGuilds(session) {
    if (session.guildsFetchedAt > Date.now() - 15_000) return session.guilds;
    const accessToken = await refreshAccessToken(session);
    session.guilds = await discordRequest('/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    session.guildsFetchedAt = Date.now();
    return session.guilds;
  }

  async function managedGuild(req, guildId, permission = 'ManageGuild') {
    if (!/^\d{17,20}$/.test(guildId || '')) {
      const error = new Error('Invalid server ID.');
      error.status = 400;
      throw error;
    }
    const session = req.dashboardSession;
    const userId = session?.user?.id;
    const userGuild = (await currentUserGuilds(session)).find(guild => guild.id === guildId);
    if (!userGuild) {
      const error = new Error('You are not a member of that server.');
      error.status = 403;
      throw error;
    }
    const guild = client.guilds.cache.get(guildId);
    const isOwner = Boolean(guild && userId && guild.ownerId === userId);
    const permissionBit = PermissionFlagsBits[permission];
    const permissionValue = BigInt(userGuild.permissions);
    const hasAdministrator = isOwner || (permissionValue & PermissionFlagsBits.Administrator) !== 0n;
    if (!hasAdministrator && (permissionValue & permissionBit) !== permissionBit) {
      const error = new Error(`You need the ${permission === 'ManageRoles' ? 'Manage Roles' : 'Manage Server'} permission in that server.`);
      error.status = 403;
      throw error;
    }
    if (!guild) {
      const error = new Error('Lobster is not available in that server. Make sure the bot is invited and online.');
      error.status = 404;
      throw error;
    }
    return guild;
  }

  function serializeSettings(guild) {
    const settings = db.getSettings(guild.id);
    return {
      prefix: settings.prefix,
      autorole: settings.autorole,
      welcomeEnabled: Boolean(settings.welcomer),
      welcomeChannel: settings.welcomeChannel,
      welcomeTitle: settings.welcomeTitle,
      welcomeMessage: settings.welcomeMessage,
      welcomeImage: settings.welcomeImage,
      welcomeColor: settings.welcomeColor,
      farewellEnabled: Boolean(settings.farewellEnabled),
      farewellChannel: settings.farewellChannel,
      farewellMessage: settings.farewellMessage,
      automod: Boolean(settings.automod),
      automodRules: settings.automodRules,
      auditLogChannel: settings.auditLogChannel,
      eventLogsEnabled: Boolean(settings.eventLogsEnabled),
      eventLogTypes: settings.eventLogTypes,
      eventLogChannels: settings.eventLogChannels,
      minAccountAgeDays: settings.minAccountAgeDays,
      blockBots: Boolean(settings.blockBots),
      joinRaidProtection: settings.joinRaidProtection,
      antiNuke: settings.antiNuke,
      levelsEnabled: Boolean(settings.levelsEnabled),
      levelUpChannel: settings.levelUpChannel,
      counting: Boolean(settings.counting),
      countingChannel: settings.countingChannel,
      lastCount: settings.lastCount,
      ticketChannel: settings.ticketChannel,
      ticketCategory: settings.ticketCategory,
      ticketAdminRole: settings.ticketAdminRole,
      ticketTranscriptChannel: settings.ticketTranscriptChannel,
      verificationEnabled: Boolean(settings.verificationEnabled),
      verificationChannel: settings.verificationChannel,
      verificationRole: settings.verificationRole,
      unverifiedRole: settings.unverifiedRole,
      quarantineRole: settings.quarantineRole,
      verificationLogChannel: settings.verificationLogChannel,
      verificationLanguage: settings.verificationLanguage
    };
  }

  function guildResources(guild) {
    const roles = [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        managed: role.managed,
        editable: role.editable
      }));
    const channels = [...guild.channels.cache.values()]
      .filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type))
      .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type === ChannelType.GuildAnnouncement ? 'announcement' : 'text',
        category: channel.parent?.name || ''
      }));
    const categories = [...guild.channels.cache.values()]
      .filter(channel => channel.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map(channel => ({ id: channel.id, name: channel.name }));
    const voiceChannels = [...guild.channels.cache.values()]
      .filter(channel => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type))
      .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        category: channel.parent?.name || '',
        userLimit: channel.userLimit || 0
      }));
    return { roles, channels, categories, voiceChannels };
  }

  function validateId(value, label) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) {
      throw new Error(`${label} must be a server role or channel.`);
    }
    return value;
  }

  function validateText(value, label, limit, allowEmpty = false) {
    if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) {
      throw new Error(`${label} must be ${allowEmpty ? 'no more than' : '1 to'} ${limit} characters.`);
    }
    return value.trim();
  }

  function applySettings(guild, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid settings payload.');
    const settings = db.getSettings(guild.id);
    const updates = {};
    const channelFields = [
      'welcomeChannel', 'farewellChannel', 'auditLogChannel', 'levelUpChannel',
      'countingChannel', 'ticketChannel', 'ticketTranscriptChannel',
      'verificationChannel', 'verificationLogChannel'
    ];
    const roleFields = ['autorole', 'ticketAdminRole', 'verificationRole', 'unverifiedRole', 'quarantineRole'];
    for (const key of channelFields) {
      if (!Object.hasOwn(body, key)) continue;
      const value = validateId(body[key], key);
      if (value && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(guild.channels.cache.get(value)?.type)) {
        throw new Error(`${key} must be a text channel in this server.`);
      }
      if (key === 'ticketTranscriptChannel' && value
        && guild.channels.cache.get(value).type !== ChannelType.GuildText) {
        throw new Error('Ticket transcripts require a server text channel.');
      }
      if (key === 'ticketTranscriptChannel' && value
        && guild.channels.cache.get(value).permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
        throw new Error('The ticket transcript channel must be private to server staff.');
      }
      updates[key] = value;
    }
    for (const key of roleFields) {
      if (!Object.hasOwn(body, key)) continue;
      const value = validateId(body[key], key);
      if (value) {
        const role = guild.roles.cache.get(value);
        if (!role || role.managed || (['autorole', 'verificationRole', 'unverifiedRole', 'quarantineRole'].includes(key) && !role.editable)) {
          throw new Error(`${key} must be a valid, non-managed role${['autorole', 'verificationRole', 'unverifiedRole', 'quarantineRole'].includes(key) ? ' that Lobster can manage' : ''}.`);
        }
      }
      updates[key] = value;
    }
    const verificationRoleIds = ['verificationRole', 'unverifiedRole', 'quarantineRole']
      .map(key => Object.hasOwn(body, key) ? body[key] : settings[key])
      .filter(Boolean);
    if (new Set(verificationRoleIds).size !== verificationRoleIds.length) {
      throw new Error('Verified, unverified, and quarantine roles must be different roles.');
    }
    if (Object.hasOwn(body, 'ticketCategory')) {
      const value = validateId(body.ticketCategory, 'ticketCategory');
      if (value && guild.channels.cache.get(value)?.type !== ChannelType.GuildCategory) {
        throw new Error('Ticket category must be a category in this server.');
      }
      updates.ticketCategory = value;
    }
    if (Object.hasOwn(body, 'prefix')) {
      if (typeof body.prefix !== 'string' || !/^\S{1,5}$/.test(body.prefix)) throw new Error('Prefix must be 1–5 characters with no spaces.');
      updates.prefix = body.prefix;
    }
    for (const [input, key, limit] of [
      ['welcomeTitle', 'welcomeTitle', 256],
      ['welcomeMessage', 'welcomeMessage', 2000],
      ['farewellMessage', 'farewellMessage', 2000]
    ]) {
      if (Object.hasOwn(body, input)) updates[key] = validateText(body[input], input, limit);
    }
    if (Object.hasOwn(body, 'welcomeImage')) {
      const value = validateText(body.welcomeImage, 'welcomeImage', 500, true);
      if (value) {
        let image;
        try { image = new URL(value); } catch { throw new Error('Welcome image must be a valid HTTP or HTTPS URL.'); }
        if (!['http:', 'https:'].includes(image.protocol)) throw new Error('Welcome image must be a valid HTTP or HTTPS URL.');
      }
      updates.welcomeImage = value || null;
    }
    if (Object.hasOwn(body, 'welcomeColor')) {
      if (typeof body.welcomeColor !== 'string' || !/^#[\da-f]{6}$/i.test(body.welcomeColor)) {
        throw new Error('Welcome color must be a six-digit hex color, such as #FF6B35.');
      }
      updates.welcomeColor = body.welcomeColor;
    }
    for (const key of ['welcomeEnabled', 'farewellEnabled', 'automod', 'eventLogsEnabled', 'levelsEnabled', 'counting', 'blockBots', 'verificationEnabled']) {
      if (Object.hasOwn(body, key)) {
        if (typeof body[key] !== 'boolean') throw new Error(`${key} must be enabled or disabled.`);
        updates[{
          welcomeEnabled: 'welcomer',
          farewellEnabled: 'farewellEnabled',
          automod: 'automod',
          eventLogsEnabled: 'eventLogsEnabled',
          levelsEnabled: 'levelsEnabled',
          counting: 'counting',
          blockBots: 'blockBots',
          verificationEnabled: 'verificationEnabled'
        }[key]] = Number(body[key]);
      }
    }
    if (Object.hasOwn(body, 'verificationLanguage')) {
      if (body.verificationLanguage !== 'en') throw new Error('Only English verification panels are currently supported.');
      updates.verificationLanguage = body.verificationLanguage;
    }
    const verificationEnabled = Object.hasOwn(body, 'verificationEnabled')
      ? body.verificationEnabled
      : Boolean(settings.verificationEnabled);
    const verificationChannel = Object.hasOwn(body, 'verificationChannel')
      ? updates.verificationChannel
      : settings.verificationChannel;
    const verificationRole = Object.hasOwn(body, 'verificationRole')
      ? updates.verificationRole
      : settings.verificationRole;
    const unverifiedRole = Object.hasOwn(body, 'unverifiedRole')
      ? updates.unverifiedRole
      : settings.unverifiedRole;
    if (verificationEnabled && (!verificationChannel || !verificationRole || !unverifiedRole)) {
      throw new Error('Choose a panel channel, verified role, and unverified role before enabling verification.');
    }
    if (verificationEnabled && !guild.members.me.permissions.has([
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ])) {
      throw new Error('Lobster needs Manage Roles, View Channel, Send Messages, and Embed Links permissions to run verification.');
    }
    if (Object.hasOwn(body, 'minAccountAgeDays')) {
      const value = body.minAccountAgeDays;
      if (!Number.isInteger(value) || value < 0 || value > 3650) throw new Error('Minimum account age must be between 0 and 3650 days.');
      updates.minAccountAgeDays = value;
    }
    for (const [input, stored, min, max] of [
      ['antiNukeLimit', 'limit', 2, 100],
      ['antiNukeWindowSeconds', 'windowSeconds', 2, 3600]
    ]) {
      if (Object.hasOwn(body, input)) {
        const value = body[input];
        if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${input} must be between ${min} and ${max}.`);
        updates.antiNuke = { ...(updates.antiNuke || settings.antiNuke), [stored]: value };
      }
    }
    if (Object.hasOwn(body, 'antiNukeEnabled')) {
      if (typeof body.antiNukeEnabled !== 'boolean') throw new Error('antiNukeEnabled must be enabled or disabled.');
      if (body.antiNukeEnabled && !guild.members.me.permissions.has([
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.KickMembers
      ])) {
        throw new Error('Give Lobster the View Audit Log and Kick Members permissions before enabling anti-nuke protection.');
      }
      updates.antiNuke = { ...(updates.antiNuke || settings.antiNuke), enabled: body.antiNukeEnabled };
    }
    if (Object.hasOwn(body, 'antiNukeExemptRoleIds')) {
      const roleIds = body.antiNukeExemptRoleIds;
      if (!Array.isArray(roleIds) || roleIds.length > 100
        || roleIds.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)
          || !guild.roles.cache.has(id) || guild.roles.cache.get(id).managed)) {
        throw new Error('Anti-nuke exemptions must be roles from this server.');
      }
      updates.antiNuke = {
        ...(updates.antiNuke || settings.antiNuke),
        exemptRoleIds: [...new Set(roleIds)]
      };
    }
    if (Object.hasOwn(body, 'joinRaidProtection')) {
      const protection = body.joinRaidProtection;
      if (!protection || typeof protection !== 'object' || Array.isArray(protection)) {
        throw new Error('Invalid join raid protection settings.');
      }
      const updated = { ...settings.joinRaidProtection };
      if (Object.hasOwn(protection, 'enabled')) {
        if (typeof protection.enabled !== 'boolean') throw new Error('Join raid protection must be enabled or disabled.');
        if (protection.enabled && !guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
          throw new Error('Give Lobster the Kick Members permission before enabling join raid protection.');
        }
        updated.enabled = protection.enabled;
      }
      if (Object.hasOwn(protection, 'limit')) {
        if (!Number.isInteger(protection.limit) || protection.limit < 2 || protection.limit > 100) {
          throw new Error('Join rate limit must be between 2 and 100 members.');
        }
        updated.limit = protection.limit;
      }
      if (Object.hasOwn(protection, 'windowSeconds')) {
        if (!Number.isInteger(protection.windowSeconds) || protection.windowSeconds < 5 || protection.windowSeconds > 300) {
          throw new Error('Join rate window must be between 5 and 300 seconds.');
        }
        updated.windowSeconds = protection.windowSeconds;
      }
      updates.joinRaidProtection = updated;
    }
    if (Object.hasOwn(body, 'automodRules')) {
      if (!body.automodRules || typeof body.automodRules !== 'object' || Array.isArray(body.automodRules)) {
        throw new Error('Invalid AutoMod rules.');
      }
      const rules = { ...settings.automodRules };
      for (const [key, value] of Object.entries(body.automodRules)) {
        if (AUTOMOD_BOOLEAN_RULES.includes(key)) {
          if (typeof value !== 'boolean') throw new Error(`${key} must be enabled or disabled.`);
          rules[key] = value;
        } else if (Object.hasOwn(AUTOMOD_NUMBER_RULES, key)) {
          const [min, max] = AUTOMOD_NUMBER_RULES[key];
          if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
          rules[key] = value;
        } else if (key === 'blockedWords') {
          if (!Array.isArray(value) || value.length > 50 || value.some(word => typeof word !== 'string' || !word.trim() || word.length > 100)) {
            throw new Error('Blocked words must contain at most 50 non-empty words of 100 characters or fewer.');
          }
          rules.blockedWords = [...new Set(value.map(word => word.trim()))];
        } else if (key === 'exemptRoleIds') {
          if (!Array.isArray(value) || value.length > 100
            || value.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id) || !guild.roles.cache.has(id))) {
            throw new Error('AutoMod exempt roles must be roles from this server.');
          }
          rules.exemptRoleIds = [...new Set(value)];
        } else if (key === 'exemptChannelIds') {
          if (!Array.isArray(value) || value.length > 100
            || value.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)
              || ![ChannelType.GuildText, ChannelType.GuildAnnouncement]
                .includes(guild.channels.cache.get(id)?.type))) {
            throw new Error('AutoMod exempt channels must be text or announcement channels from this server.');
          }
          rules.exemptChannelIds = [...new Set(value)];
        } else {
          throw new Error(`Unknown AutoMod rule: ${key}.`);
        }
      }
      updates.automodRules = rules;
    }
    if (Object.hasOwn(body, 'eventLogTypes')) {
      if (!body.eventLogTypes || typeof body.eventLogTypes !== 'object' || Array.isArray(body.eventLogTypes)) {
        throw new Error('Invalid event log categories.');
      }
      const categories = { ...settings.eventLogTypes };
      for (const [key, value] of Object.entries(body.eventLogTypes)) {
        if (!LOG_CATEGORIES.includes(key) || typeof value !== 'boolean') throw new Error(`Invalid event log category: ${key}.`);
        categories[key] = value;
      }
      updates.eventLogTypes = categories;
    }
    if (Object.hasOwn(body, 'eventLogChannels')) {
      if (!body.eventLogChannels || typeof body.eventLogChannels !== 'object' || Array.isArray(body.eventLogChannels)) {
        throw new Error('Invalid event log channels.');
      }
      const channels = { ...settings.eventLogChannels };
      for (const [key, value] of Object.entries(body.eventLogChannels)) {
        if (!LOG_CATEGORIES.includes(key)) throw new Error(`Invalid event log category: ${key}.`);
        const channelId = validateId(value, `${key} log channel`);
        if (channelId && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(guild.channels.cache.get(channelId)?.type)) {
          throw new Error(`The ${key} log destination must be a text channel in this server.`);
        }
        channels[key] = channelId;
      }
      updates.eventLogChannels = channels;
    }
    for (const [key, value] of Object.entries(updates)) {
      db.updateSetting(guild.id, key, value);
    }
    return serializeSettings(guild);
  }

  async function editableRole(guild, roleId, userId) {
    const role = guild.roles.cache.get(roleId);
    if (!role || role.id === guild.id || role.managed) {
      const error = new Error('That role cannot be edited.');
      error.status = 400;
      throw error;
    }
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!role.editable || role.position >= botMember.roles.highest.position) {
      const error = new Error('Move Lobster’s highest role above the role you want to edit.');
      error.status = 403;
      throw error;
    }
    const actingMember = await guild.members.fetch(userId);
    if (!actingMember.permissions.has(PermissionFlagsBits.Administrator)
      && role.position >= actingMember.roles.highest.position) {
      const error = new Error('You cannot edit a role at or above your highest role.');
      error.status = 403;
      throw error;
    }
    return role;
  }

  app.get('/api/health', (req, res) => res.json({
    ok: true,
    service: 'lobster-dashboard',
    ready: client.isReady(),
    configured: Boolean(configReady()),
    time: new Date().toISOString()
  }));

  function beginDiscordLogin(req, res, returnAuthorizationUrl = false) {
    if (!configReady()) return res.status(503).json({ error: 'Discord OAuth is not configured on the bot host yet.' });
    const now = Date.now();
    const address = req.ip;
    const attempt = loginAttempts.get(address);
    if (attempt && now - attempt.startedAt < 15 * 60 * 1000 && attempt.count >= 20) {
      return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in a few minutes.' });
    }
    loginAttempts.set(address, attempt && now - attempt.startedAt < 15 * 60 * 1000
      ? { ...attempt, count: attempt.count + 1 }
      : { startedAt: now, count: 1 });
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, Date.now() + OAUTH_STATE_TTL);
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state
    });
    const authorizationUrl = `https://discord.com/oauth2/authorize?${query}`;
    if (returnAuthorizationUrl) return res.json({ authorizationUrl });
    res.redirect(authorizationUrl);
  }

  app.get('/api/auth/login', (req, res) => beginDiscordLogin(req, res));
  app.get('/api/auth/login-url', requireOrigin, (req, res) => beginDiscordLogin(req, res, true));

  app.get('/api/auth/callback', async (req, res, next) => {
    try {
      if (!configReady()) return res.status(503).send('Discord OAuth is not configured.');
      const { code, state, error } = req.query;
      const expiry = oauthStates.get(state);
      oauthStates.delete(state);
      if (error || typeof code !== 'string' || typeof state !== 'string' || !expiry || expiry <= Date.now()) {
        return res.redirect(`${returnUrl || `${origin}/dashboard.html`}?error=discord_login`);
      }
      const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });
      if (!tokenResponse.ok) throw new Error(`Discord OAuth token exchange failed (${tokenResponse.status}).`);
      const token = await tokenResponse.json();
      const user = await discordRequest('/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const id = crypto.randomBytes(32).toString('hex');
      sessions.set(id, {
        user: { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar },
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        sessionExpiresAt: Date.now() + SESSION_TTL
      });
      const exchangeCode = crypto.randomBytes(32).toString('hex');
      exchangeCodes.set(exchangeCode, { sessionId: id, expiresAt: Date.now() + 60_000 });
      const destination = new URL(returnUrl || `${origin}/dashboard.html`);
      destination.hash = new URLSearchParams({ auth_code: exchangeCode }).toString();
      res.redirect(destination.toString());
    } catch (error) {
      console.error('Dashboard Discord OAuth callback failed:', error);
      if (configReady()) return res.redirect(`${returnUrl || `${origin}/dashboard.html`}?error=discord_login`);
      next(error);
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const found = readSession(req);
    res.json({ user: found?.session.user || null });
  });

  app.post('/api/auth/exchange', requireOrigin, (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !/^[\da-f]{64}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid sign-in code. Please sign in again.' });
    }
    const exchange = exchangeCodes.get(code);
    exchangeCodes.delete(code);
    if (!exchange || exchange.expiresAt <= Date.now() || !sessions.has(exchange.sessionId)) {
      return res.status(401).json({ error: 'Your sign-in code expired. Please sign in again.' });
    }
    res.json({ token: sessionTokenValue(exchange.sessionId) });
  });

  app.post('/api/auth/logout', requireOrigin, (req, res) => {
    const found = readSession(req);
    if (found) sessions.delete(found.id);
    res.sendStatus(204);
  });

  app.get('/api/guilds', requireSession, async (req, res, next) => {
    try {
      const guilds = await currentUserGuilds(req.dashboardSession);
      const manageable = guilds.filter(guild =>
        (BigInt(guild.permissions) & (PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild)) !== 0n
      );
      res.json(manageable.map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        installed: client.guilds.cache.has(guild.id)
      })));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/guilds/:guildId', requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      res.json({
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) },
        settings: serializeSettings(guild),
        ...guildResources(guild),
        stats: {
          members: guild.memberCount,
          channels: guild.channels.cache.size,
          roles: guild.roles.cache.size - 1,
          commands: client.commands.size,
          botPermissions: guild.members.me?.permissions.bitfield.toString() || '0'
        },
        voice: voiceManager.status(guild),
        autoReplies: db.getAutoReplies(guild.id)
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/guilds/:guildId/settings', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      if (req.body && ['verificationEnabled', 'verificationRole', 'unverifiedRole', 'quarantineRole']
        .some(key => Object.hasOwn(req.body, key))) {
        await managedGuild(req, req.params.guildId, 'ManageRoles');
      }
      res.json({ settings: applySettings(guild, req.body) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/guilds/:guildId/roles', requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId, 'ManageRoles');
      res.json(guildResources(guild).roles);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/roles', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId, 'ManageRoles');
      const name = validateText(req.body.name, 'Role name', 100);
      const color = req.body.color ?? '#99AAB5';
      if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) throw new Error('Role color must be a six-digit hex color.');
      const role = await guild.roles.create({
        name,
        color,
        reason: `Role created from Lobster dashboard by ${req.dashboardSession.user.id}`
      });
      res.status(201).json({ role: { id: role.id, name: role.name, color: role.hexColor, position: role.position, managed: role.managed, editable: role.editable } });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/guilds/:guildId/roles/:roleId', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId, 'ManageRoles');
      const role = await editableRole(guild, req.params.roleId, req.dashboardSession.user.id);
      const edits = {};
      if (Object.hasOwn(req.body, 'name')) edits.name = validateText(req.body.name, 'Role name', 100);
      if (Object.hasOwn(req.body, 'color')) {
        if (typeof req.body.color !== 'string' || !/^#[\da-f]{6}$/i.test(req.body.color)) throw new Error('Role color must be a six-digit hex color.');
        edits.color = req.body.color;
      }
      if (!Object.keys(edits).length) throw new Error('Provide a role name or color to update.');
      const updated = await role.edit(edits, `Role updated from Lobster dashboard by ${req.dashboardSession.user.id}`);
      res.json({ role: { id: updated.id, name: updated.name, color: updated.hexColor, position: updated.position, managed: updated.managed, editable: updated.editable } });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/guilds/:guildId/roles/:roleId', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId, 'ManageRoles');
      const role = await editableRole(guild, req.params.roleId, req.dashboardSession.user.id);
      await role.delete(`Role deleted from Lobster dashboard by ${req.dashboardSession.user.id}`);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/cleanup', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId, 'ManageGuild');
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const channelIds = Array.isArray(body.channels) ? [...new Set(body.channels)] : [];
      const roleIds = Array.isArray(body.roles) ? [...new Set(body.roles)] : [];
      const total = channelIds.length + roleIds.length;
      const badRequest = message => {
        const error = new Error(message);
        error.status = 400;
        return error;
      };
      if (!total) throw badRequest('Select at least one channel or role to delete.');
      if (total > 100) throw badRequest('Delete at most 100 items at a time.');
      for (const id of [...channelIds, ...roleIds]) {
        if (typeof id !== 'string' || !/^\d{17,20}$/.test(id)) throw badRequest('Invalid selection.');
      }
      if (body.confirm !== guild.name) {
        throw badRequest(`Type the server name "${guild.name}" to confirm this deletion.`);
      }

      const me = guild.members.me || await guild.members.fetchMe();
      const userId = req.dashboardSession.user.id;
      const actingMember = await guild.members.fetch(userId);
      const isAdmin = actingMember.permissions.has(PermissionFlagsBits.Administrator);

      if (channelIds.length) {
        if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          const error = new Error('Lobster needs Manage Channels to delete channels.');
          error.status = 403;
          throw error;
        }
        if (!isAdmin && !actingMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          const error = new Error('You need Manage Channels to delete channels.');
          error.status = 403;
          throw error;
        }
      }
      if (roleIds.length && !isAdmin && !actingMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        const error = new Error('You need Manage Roles to delete roles.');
        error.status = 403;
        throw error;
      }

      const reason = `Bulk cleanup from Lobster dashboard by ${userId}`;
      const deleted = { channels: [], roles: [] };
      const failed = [];
      for (const id of channelIds) {
        const channel = guild.channels.cache.get(id);
        if (!channel) {
          failed.push({ id, name: id, reason: 'Channel no longer exists.' });
          continue;
        }
        const label = channel.name;
        try {
          await channel.delete(reason);
          deleted.channels.push(label);
        } catch (error) {
          failed.push({ id, name: label, reason: error.message });
        }
      }
      for (const id of roleIds) {
        let label = id;
        try {
          const role = await editableRole(guild, id, userId);
          label = role.name;
          await role.delete(reason);
          deleted.roles.push(label);
        } catch (error) {
          failed.push({ id, name: label, reason: error.message });
        }
      }
      res.json({ deleted, failed });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/auto-replies', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const trigger = validateText(req.body.trigger, 'Trigger', 100);
      const response = validateText(req.body.response, 'Response', 1500);
      db.setAutoReply(guild.id, trigger, response);
      res.status(201).json({ autoReplies: db.getAutoReplies(guild.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/guilds/:guildId/auto-replies', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const trigger = validateText(req.body.trigger, 'Trigger', 100);
      if (!db.removeAutoReply(guild.id, trigger)) return res.status(404).json({ error: 'That automatic reply was not found.' });
      res.json({ autoReplies: db.getAutoReplies(guild.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/verification-panel', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const settings = db.getSettings(guild.id);
      if (!settings.verificationEnabled || !settings.verificationChannel || !settings.verificationRole) {
        throw new Error('Save verification settings and enable the system before publishing its panel.');
      }
      const channel = guild.channels.cache.get(settings.verificationChannel);
      const botMember = guild.members.me;
      if (!channel || !channel.isTextBased()) throw new Error('The verification panel channel is unavailable.');
      if (!channel.permissionsFor(botMember)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ])) {
        throw new Error('Give Lobster View Channel, Send Messages, and Embed Links permissions in the verification channel.');
      }
      const panel = {
        embeds: [new EmbedBuilder()
          .setColor(0xed6735)
          .setTitle('Verify to access the server')
          .setDescription('Press the button below to verify your Discord account and receive the verified member role.')
          .setFooter({ text: 'Lobster verification' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('verification_verify')
            .setLabel('Verify')
            .setStyle(ButtonStyle.Primary)
        )],
        allowedMentions: { parse: [] }
      };
      let message = null;
      if (settings.verificationPanelMessageId) {
        try {
          message = await channel.messages.fetch(settings.verificationPanelMessageId);
        } catch (error) {
          if (error.code !== 10008) throw error;
        }
      }
      if (message) await message.edit(panel);
      else message = await channel.send(panel);
      db.updateSetting(guild.id, 'verificationPanelMessageId', message.id);
      res.json({ message: 'Verification panel published.', messageId: message.id });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/verification-test-log', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const settings = db.getSettings(guild.id);
      if (!settings.verificationLogChannel) throw new Error('Choose and save a verification log channel first.');
      const channel = guild.channels.cache.get(settings.verificationLogChannel);
      if (!channel?.isTextBased()) throw new Error('The verification log channel is unavailable.');
      if (!channel.permissionsFor(guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ])) {
        throw new Error('Give Lobster View Channel, Send Messages, and Embed Links permissions in the log channel.');
      }
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('Verification log test')
          .setDescription(`Verification logs are working. Test requested by <@${req.dashboardSession.user.id}>.`)
          .setTimestamp()],
        allowedMentions: { parse: [] }
      });
      res.json({ message: 'Test log sent.' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/guilds/:guildId/voice', requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      res.json({
        voice: voiceManager.status(guild),
        channels: guildResources(guild).voiceChannels,
        recordings: voiceManager.listRecordings(guild.id, guild)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/connect', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      if (req.body?.serverId && req.body.serverId !== guild.id) {
        const error = new Error('Server ID does not match the active server selection.');
        error.status = 400;
        throw error;
      }
      const channelId = req.body?.channelId;
      if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId)) {
        const error = new Error('Voice Channel ID must be a valid 17–20 digit Discord ID.');
        error.status = 400;
        throw error;
      }
      const channel = guild.channels.cache.get(channelId);
      if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
        const error = new Error('That Voice Channel ID was not found in this server.');
        error.status = 400;
        throw error;
      }
      const permissions = channel.permissionsFor(guild.members.me);
      if (!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ])) {
        const error = new Error('Lobster needs View Channel, Connect, and Speak permissions in that voice channel.');
        error.status = 403;
        throw error;
      }
      const status = await voiceManager.connect(guild, channel);
      res.json({ voice: status, message: `Lobster joined ${channel.name}.` });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/disconnect', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      voiceManager.disconnect(guild.id);
      res.json({ voice: voiceManager.status(guild), message: 'Lobster left the voice channel.' });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/guilds/:guildId/voice/auto-reconnect', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      if (typeof req.body?.enabled !== 'boolean') {
        const error = new Error('Auto-reconnect must be enabled or disabled.');
        error.status = 400;
        throw error;
      }
      voiceManager.setAutoReconnect(guild.id, req.body.enabled);
      res.json({
        voice: voiceManager.status(guild),
        message: req.body.enabled ? 'Auto-reconnect enabled.' : 'Auto-reconnect disabled.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/mute', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      if (typeof req.body?.mute !== 'boolean') {
        const error = new Error('Microphone state must be open or closed.');
        error.status = 400;
        throw error;
      }
      const voice = voiceManager.setSelfMute(guild.id, req.body.mute);
      res.json({ voice, message: req.body.mute ? 'Microphone closed.' : 'Microphone opened.' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/deafen', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      if (typeof req.body?.deafen !== 'boolean') {
        const error = new Error('Deafen state must be open or closed.');
        error.status = 400;
        throw error;
      }
      const voice = voiceManager.setSelfDeaf(guild.id, req.body.deafen);
      res.json({ voice, message: req.body.deafen ? 'Deafened.' : 'Undeafened.' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/recording/start', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const voice = voiceManager.recordStart(guild);
      res.json({
        voice,
        recordings: voiceManager.listRecordings(guild.id, guild),
        message: 'Recording started. Lobster is capturing the members of the voice channel.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/guilds/:guildId/voice/recording/stop', requireOrigin, requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const voice = await voiceManager.recordStop(guild);
      res.json({
        voice,
        recordings: voiceManager.listRecordings(guild.id, guild),
        message: 'Recording stopped. The captured audio is saved below.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/guilds/:guildId/voice/recordings', requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      res.json({ recordings: voiceManager.listRecordings(guild.id, guild) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/guilds/:guildId/voice/recordings/:session/:file', requireSession, async (req, res, next) => {
    try {
      const guild = await managedGuild(req, req.params.guildId);
      const filePath = voiceManager.resolveRecordingFile(guild.id, req.params.session, req.params.file);
      if (!filePath) {
        const error = new Error('That recording could not be found.');
        error.status = 404;
        throw error;
      }
      res.setHeader('Content-Type', 'audio/ogg');
      res.setHeader('Content-Disposition', `attachment; filename="${guild.id}-${req.params.file}"`);
      fs.createReadStream(filePath).on('error', next).pipe(res);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 400;
    if (status >= 500) {
      console.error('Dashboard API failed:', error);
      return res.status(status).json({ error: 'The dashboard request failed. Please try again.' });
    }
    res.status(status).json({ error: error.message || 'The dashboard request failed.' });
  });

  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.sessionExpiresAt <= now) sessions.delete(id);
    }
    for (const [state, expiry] of oauthStates) {
      if (expiry <= now) oauthStates.delete(state);
    }
    for (const [address, attempt] of loginAttempts) {
      if (now - attempt.startedAt >= 15 * 60 * 1000) loginAttempts.delete(address);
    }
    for (const [code, exchange] of exchangeCodes) {
      if (exchange.expiresAt <= now) exchangeCodes.delete(code);
    }
  }, 60_000);
  pruneTimer.unref();

  return {
    app,
    listen(port) {
      return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => resolve(server));
        server.once('error', reject);
      });
    },
    isConfigured: configReady
  };
}

module.exports = { createDashboardServer };
