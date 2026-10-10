const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_BACKUP_MESSAGES = 10000;
const backupDirectory = process.env.LOBSTER_BACKUP_DIRECTORY
  ? path.resolve(process.env.LOBSTER_BACKUP_DIRECTORY)
  : path.join(__dirname, '..', 'data', 'backups');
const backupsInProgress = new Set();

function getBackupPath(guildId) {
  if (!/^\d{17,20}$/.test(guildId)) throw new Error('Invalid server ID.');
  return path.join(backupDirectory, `guild-${guildId}.json.gz`);
}

function readBackup(guildId) {
  const backupPath = getBackupPath(guildId);
  if (!fs.existsSync(backupPath)) return null;
  const snapshot = JSON.parse(gunzipSync(fs.readFileSync(backupPath)).toString('utf8'));
  if (snapshot.formatVersion !== 1
    || snapshot.guild?.id !== guildId
    || !Number.isFinite(Date.parse(snapshot.createdAt))
    || !Array.isArray(snapshot.roles)
    || !Array.isArray(snapshot.channels)
    || !Array.isArray(snapshot.messages)) {
    throw new Error('Saved backup file is invalid.');
  }
  return snapshot;
}

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable,
    managed: role.managed,
    icon: role.icon,
    unicodeEmoji: role.unicodeEmoji,
    tags: role.tags ? {
      botId: role.tags.botId ?? null,
      integrationId: role.tags.integrationId ?? null,
      premiumSubscriberRole: role.tags.premiumSubscriberRole ?? null
    } : null
  };
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    position: channel.position,
    topic: channel.topic ?? null,
    nsfw: channel.nsfw ?? false,
    rateLimitPerUser: channel.rateLimitPerUser ?? 0,
    bitrate: channel.bitrate ?? null,
    userLimit: channel.userLimit ?? null,
    rtcRegion: channel.rtcRegion ?? null,
    videoQualityMode: channel.videoQualityMode ?? null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? null,
    defaultForumLayout: channel.defaultForumLayout ?? null,
    defaultSortOrder: channel.defaultSortOrder ?? null,
    availableTags: channel.availableTags?.map(tag => ({
      id: tag.id,
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emojiId,
      emojiName: tag.emojiName
    })) ?? [],
    permissionOverwrites: channel.permissionOverwrites?.cache.map(overwrite => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString()
    })) ?? []
  };
}

function serializeMessage(message, channelId) {
  return {
    id: message.id,
    channelId,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map(attachment => ({
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size
    })),
    embeds: message.embeds.map(embed => embed.toJSON())
  };
}

async function fetchChannelMessages(channel, since, until, messages) {
  const me = channel.guild.members.me;
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    throw new Error(`I need View Channel and Read Message History in #${channel.name}.`);
  }

  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (page.size === 0) break;

    const pageMessages = [...page.values()];
    const oldest = pageMessages.reduce((result, message) =>
      message.createdTimestamp < result.createdTimestamp ? message : result
    );
    for (const message of pageMessages) {
      if (message.createdTimestamp <= since || message.createdTimestamp > until) continue;
      messages.push(serializeMessage(message, channel.id));
      if (messages.length > MAX_BACKUP_MESSAGES) {
        throw new Error(`This backup contains more than ${MAX_BACKUP_MESSAGES.toLocaleString()} messages. The previous backup was kept.`);
      }
    }

    if (oldest.createdTimestamp <= since || page.size < 100) break;
    before = oldest.id;
  }
}

async function createBackup(guild) {
  if (backupsInProgress.has(guild.id)) throw new Error('A backup is already running for this server.');
  backupsInProgress.add(guild.id);
  let temporaryPath;

  try {
    await guild.roles.fetch();
    await guild.channels.fetch();
    const backupPath = getBackupPath(guild.id);
    let previous = null;
    try {
      previous = readBackup(guild.id);
    } catch (error) {
      console.error(`Could not read the previous backup for ${guild.name} (${guild.id}); creating a fresh three-day snapshot:`, error);
    }

    const createdAt = new Date();
    const windowEnd = createdAt.getTime();
    const windowStart = previous?.createdAt && Number.isFinite(Date.parse(previous.createdAt))
      ? Date.parse(previous.createdAt)
      : createdAt.getTime() - BACKUP_INTERVAL_MS;
    const channelsById = new Map([...guild.channels.cache.values()].map(channel => [channel.id, channel]));
    if (typeof guild.channels.fetchActiveThreads === 'function') {
      const activeThreads = await guild.channels.fetchActiveThreads();
      for (const thread of activeThreads.threads.values()) channelsById.set(thread.id, thread);
    }
    const channels = [...channelsById.values()];

    const messages = [];
    const messageChannels = channels.filter(channel =>
      channel.isTextBased?.()
      && channel.messages?.fetch
      && !channel.isThread?.()
      && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
    );
    const threads = channels.filter(channel => channel.isThread?.() && channel.messages?.fetch);

    for (const channel of [...messageChannels, ...threads]) {
      await fetchChannelMessages(channel, windowStart, windowEnd, messages);
    }

    const snapshot = {
      formatVersion: 1,
      guild: { id: guild.id, name: guild.name },
      createdAt: createdAt.toISOString(),
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: createdAt.toISOString(),
      messageLimit: MAX_BACKUP_MESSAGES,
      roles: [...guild.roles.cache.values()].map(serializeRole),
      channels: channels.map(serializeChannel),
      messages: messages.sort((first, second) => first.createdAt.localeCompare(second.createdAt))
    };
    const compressed = gzipSync(Buffer.from(`${JSON.stringify(snapshot)}\n`));
    fs.mkdirSync(backupDirectory, { recursive: true });
    temporaryPath = `${backupPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(temporaryPath, compressed, { flag: 'wx' });
    fs.renameSync(temporaryPath, backupPath);

    return { snapshot, bytes: compressed.length, path: backupPath };
  } finally {
    if (temporaryPath && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    backupsInProgress.delete(guild.id);
  }
}

function isBackupInProgress(guildId) {
  return backupsInProgress.has(guildId);
}

module.exports = {
  BACKUP_INTERVAL_MS,
  MAX_BACKUP_MESSAGES,
  createBackup,
  getBackupPath,
  isBackupInProgress,
  readBackup
};
