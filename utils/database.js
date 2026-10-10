const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data');
const databasePath = path.join(dataDirectory, 'database.json');

fs.mkdirSync(dataDirectory, { recursive: true });

function emptyDatabase() {
  return {
    guild_settings: {},
    giveaways: {},
    giveaway_participants: {},
    afk: {},
    levels: {},
    autoReplies: {},
    reactionRoles: {}
  };
}

if (!fs.existsSync(databasePath)) {
  fs.writeFileSync(databasePath, `${JSON.stringify(emptyDatabase(), null, 2)}\n`, { flag: 'wx' });
}

function read() {
  const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  database.guild_settings ||= {};
  database.giveaways ||= {};
  database.giveaway_participants ||= {};
  database.afk ||= {};
  database.levels ||= {};
  database.autoReplies ||= {};
  database.reactionRoles ||= {};
  return database;
}

function write(database) {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`);
  fs.renameSync(temporaryPath, databasePath);
}

function defaults(guildId) {
  return {
    guildId,
    prefix: 'p',
    backupsEnabled: false,
    autorole: null,
    welcomer: 0,
    welcomeChannel: null,
    welcomeTitle: 'A new member has arrived!',
    welcomeMessage: 'Welcome {user} to **{server}**! We are glad you are here.',
    welcomeImage: null,
    welcomeThumbnail: null,
    welcomeColor: '#FF6B35',
    welcomeFooter: 'Member #{membercount}',
    welcomeServerAddress: null,
    farewellEnabled: 0,
    farewellChannel: null,
    farewellMessage: '{username} has left {server}. We will miss you!',
    automod: 0,
    automodRules: {
      links: true,
      invites: true,
      blockedWords: [],
      spam: true,
      spamLimit: 5,
      spamWindowSeconds: 10,
      duplicate: true,
      duplicateLimit: 3,
      duplicateWindowSeconds: 60,
      caps: false,
      capsPercentage: 70,
      emoji: false,
      emojiLimit: 6,
      mentions: false,
      mentionsLimit: 3,
      longMessages: false,
      longMessagesLimit: 500,
      longLines: false,
      longLinesLimit: 6,
      imageSpam: false,
      imageSpamLimit: 5,
      exemptRoleIds: [],
      exemptChannelIds: [],
      advertisements: false
    },
    auditLogChannel: null,
    eventLogsEnabled: true,
    eventLogTypes: {
      general: true,
      moderation: true,
      members: true,
      messages: true,
      channels: true,
      roles: true,
      voice: true,
      emojis: true,
      levels: true,
      security: true
    },
    eventLogChannels: {
      general: null,
      moderation: null,
      members: null,
      messages: null,
      channels: null,
      roles: null,
      voice: null,
      emojis: null,
      levels: null,
      security: null
    },
    minAccountAgeDays: 0,
    blockBots: false,
    joinRaidProtection: {
      enabled: false,
      limit: 10,
      windowSeconds: 20
    },
    antiNuke: {
      enabled: false,
      limit: 4,
      windowSeconds: 10,
      exemptRoleIds: []
    },
    counting: 0,
    countingChannel: null,
    lastCount: 0,
    lastCounter: null,
    register: 0,
    antiself: 0,
    antiselfPermissions: {},
    ticketChannel: null,
    ticketCategory: null,
    ticketAdminRole: null,
    ticketMessage: 'Need help from our team? Open a private ticket and we will get back to you as soon as we can.',
    ticketPrompt: 'Hi {user}! Please describe your issue in detail. A member of our team will be with you shortly.',
    ticketImage: null,
    ticketTitle: 'How can we help?',
    ticketButtonLabel: 'Create a ticket',
    ticketColor: '#FF6B35',
    ticketPanelMessageId: null,
    ticketTranscriptChannel: null,
    verificationEnabled: false,
    verificationChannel: null,
    verificationRole: null,
    unverifiedRole: null,
    quarantineRole: null,
    verificationLogChannel: null,
    verificationLanguage: 'en',
    verificationPanelMessageId: null,
    levelsEnabled: 1,
    levelUpChannel: null,
    lockedChannels: {}
  };
}

function getSettings(guildId) {
  if (!guildId) return null;
  const database = read();
  if (!database.guild_settings[guildId]) {
    database.guild_settings[guildId] = defaults(guildId);
    write(database);
  } else {
    database.guild_settings[guildId] = {
      ...defaults(guildId),
      ...database.guild_settings[guildId],
      automodRules: {
        ...defaults(guildId).automodRules,
        ...database.guild_settings[guildId].automodRules
      },
      antiNuke: {
        ...defaults(guildId).antiNuke,
        ...database.guild_settings[guildId].antiNuke
      },
      joinRaidProtection: {
        ...defaults(guildId).joinRaidProtection,
        ...database.guild_settings[guildId].joinRaidProtection
      },
      eventLogTypes: {
        ...defaults(guildId).eventLogTypes,
        ...database.guild_settings[guildId].eventLogTypes
      },
      eventLogChannels: {
        ...defaults(guildId).eventLogChannels,
        ...database.guild_settings[guildId].eventLogChannels
      }
    };
  }
  return database.guild_settings[guildId];
}

function updateSetting(guildId, key, value) {
  if (!guildId) throw new Error('A guild ID is required to update settings.');
  const database = read();
  database.guild_settings[guildId] = {
    ...defaults(guildId),
    ...database.guild_settings[guildId],
    [key]: value
  };
  write(database);
  return database.guild_settings[guildId];
}

module.exports = {
  getSettings,
  updateSetting,

  getGiveaway(messageId) {
    return read().giveaways[messageId] || null;
  },

  createGiveaway(giveaway) {
    const database = read();
    database.giveaways[giveaway.messageId] = { ...giveaway, ended: 0 };
    database.giveaway_participants[giveaway.messageId] ||= [];
    write(database);
  },

  addParticipant(messageId, userId) {
    const database = read();
    const giveaway = database.giveaways[messageId];
    if (!giveaway || giveaway.ended || giveaway.endTime <= Date.now()) return false;
    database.giveaway_participants[messageId] ||= [];
    const participants = database.giveaway_participants[messageId];
    if (participants.includes(userId)) return false;
    participants.push(userId);
    write(database);
    return true;
  },

  getParticipants(messageId) {
    return (read().giveaway_participants[messageId] || []).map(userId => ({ userId }));
  },

  endGiveaway(messageId) {
    const database = read();
    if (!database.giveaways[messageId] || database.giveaways[messageId].ended) return false;
    database.giveaways[messageId].ended = 1;
    write(database);
    return true;
  },

  getActiveGiveaways() {
    return Object.values(read().giveaways).filter(giveaway => !giveaway.ended);
  },

  getAFK(userId, guildId) {
    return read().afk[`${userId}_${guildId}`] || null;
  },

  setAFK(userId, guildId, reason, timestamp) {
    const database = read();
    database.afk[`${userId}_${guildId}`] = { userId, guildId, reason, timestamp };
    write(database);
  },

  removeAFK(userId, guildId) {
    const database = read();
    delete database.afk[`${userId}_${guildId}`];
    write(database);
  },

  awardXP(guildId, userId, amount, cooldownMs) {
    const database = read();
    database.levels[guildId] ||= {};
    const user = database.levels[guildId][userId] || { xp: 0, lastXpAt: 0 };
    const now = Date.now();
    if (now - user.lastXpAt < cooldownMs) return null;

    const oldLevel = Math.floor((Math.sqrt(1 + (8 * user.xp) / 100) - 1) / 2);
    user.xp += amount;
    user.lastXpAt = now;
    const newLevel = Math.floor((Math.sqrt(1 + (8 * user.xp) / 100) - 1) / 2);
    database.levels[guildId][userId] = user;
    write(database);
    return { xp: user.xp, gained: amount, oldLevel, level: newLevel };
  },

  getLevel(guildId, userId) {
    const user = read().levels[guildId]?.[userId] || { xp: 0, lastXpAt: 0 };
    const level = Math.floor((Math.sqrt(1 + (8 * user.xp) / 100) - 1) / 2);
    const currentLevelXP = 50 * level * (level + 1);
    const nextLevelXP = 50 * (level + 1) * (level + 2);
    return {
      xp: user.xp,
      level,
      progress: user.xp - currentLevelXP,
      needed: nextLevelXP - currentLevelXP
    };
  },

  getLeaderboard(guildId, limit = 10) {
    return Object.entries(read().levels[guildId] || {})
      .map(([userId, user]) => ({ userId, xp: user.xp || 0 }))
      .sort((first, second) => second.xp - first.xp)
      .slice(0, limit)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
        level: Math.floor((Math.sqrt(1 + (8 * user.xp) / 100) - 1) / 2)
      }));
  },

  getLevelRank(guildId, userId) {
    const levels = read().levels[guildId] || {};
    const xp = levels[userId]?.xp || 0;
    return Object.entries(levels).filter(([id, user]) =>
      (user.xp || 0) > xp || ((user.xp || 0) === xp && id < userId)
    ).length + 1;
  },

  setAutoReply(guildId, trigger, response) {
    const database = read();
    database.autoReplies[guildId] ||= {};
    database.autoReplies[guildId][trigger] = response;
    write(database);
  },

  removeAutoReply(guildId, trigger) {
    const database = read();
    const replies = database.autoReplies[guildId] || {};
    const key = Object.keys(replies).find(value => value.toLowerCase() === trigger.toLowerCase());
    if (!key) return false;
    delete replies[key];
    write(database);
    return true;
  },

  getAutoReplies(guildId) {
    return read().autoReplies[guildId] || {};
  },

  setReactionRole(guildId, messageId, emoji, roleId, channelId) {
    const database = read();
    database.reactionRoles[guildId] ||= {};
    database.reactionRoles[guildId][messageId] ||= {};
    database.reactionRoles[guildId][messageId][emoji] = { roleId, channelId };
    write(database);
  },

  removeReactionRole(guildId, messageId, emoji) {
    const database = read();
    const mappings = database.reactionRoles[guildId]?.[messageId];
    if (!mappings || !mappings[emoji]) return false;
    delete mappings[emoji];
    if (Object.keys(mappings).length === 0) delete database.reactionRoles[guildId][messageId];
    write(database);
    return true;
  },

  getReactionRoles(guildId, messageId) {
    return read().reactionRoles[guildId]?.[messageId] || {};
  },

  getReactionRole(guildId, messageId, emoji) {
    return read().reactionRoles[guildId]?.[messageId]?.[emoji] || null;
  }
};
