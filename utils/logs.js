const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { logEvent } = require('./logging/logger');
const { TYPE_MAP } = require('./logging/categories');

const LOG_CATEGORIES = {
  server: { emoji: '🏠', label: 'Server', color: 0x5BA6FB, description: 'Server name, icon and settings' },
  moderation: { emoji: '🔨', label: 'Moderation', color: 0xED4245, description: 'Bans, kicks, warnings, timeouts and punishments' },
  members: { emoji: '👥', label: 'Members', color: 0x57F287, description: 'Member joins and leaves' },
  messages: { emoji: '💬', label: 'Messages', color: 0x5BA6FB, description: 'Message edits, deletes and bulk deletes' },
  channels: { emoji: '📚', label: 'Channels', color: 0x5BA6FB, description: 'Channel creation, deletion and updates' },
  roles: { emoji: '🎭', label: 'Roles', color: 0xEB459E, description: 'Role changes and member role updates' },
  voice: { emoji: '🔊', label: 'Voice', color: 0x57F287, description: 'Voice joins, leaves and state changes' },
  emojis: { emoji: '😄', label: 'Emojis', color: 0xFEE75C, description: 'Emoji creation, deletion and updates' },
  stickers: { emoji: '🩹', label: 'Stickers', color: 0xFEE75C, description: 'Sticker creation, deletion and updates' },
  bots: { emoji: '🤖', label: 'Bots', color: 0x9B59B6, description: 'Bots added to or removed from the server' },
  tags: { emoji: '🏷️', label: 'Tags', color: 0xF1C40F, description: 'Usernames, display names and nicknames' },
  threads: { emoji: '🧵', label: 'Threads', color: 0x3498DB, description: 'Thread creation, deletion and updates' },
  invites: { emoji: '🔗', label: 'Invites', color: 0x1ABC9C, description: 'Invite creation and deletion' },
  security: { emoji: '🚨', label: 'Security', color: 0xED4245, description: 'Anti-nuke, webhook and automod alerts' },
  levels: { emoji: '📈', label: 'Levels', color: 0x5BA6FB, description: 'Level ups and XP milestones' },
  tickets: { emoji: '🎫', label: 'Tickets', color: 0x5BA6FB, description: 'Support ticket events' },
  general: { emoji: '📋', label: 'General', color: 0x5BA6FB, description: 'Everything else' }
};

const CATEGORY_KEYS = Object.keys(LOG_CATEGORIES);

function channelName(category) {
  const meta = LOG_CATEGORIES[category];
  return `${meta.emoji}・${category}-log`;
}

function findNamedChannel(guild, category) {
  const target = channelName(category).toLowerCase();
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText && channel.name.toLowerCase() === target
  ) || null;
}

function resolveChannel(guild, settings, category) {
  if (settings.logMode === 'all-in-one') {
    return settings.auditLogChannel
      ? guild.channels.cache.get(settings.auditLogChannel)
      : null;
  }

  const configured = settings.eventLogChannels?.[category]
    ? guild.channels.cache.get(settings.eventLogChannels[category])
    : null;
  if (configured?.isTextBased()) return configured;

  const main = settings.auditLogChannel
    ? guild.channels.cache.get(settings.auditLogChannel)
    : null;
  if (main?.isTextBased()) return main;

  return findNamedChannel(guild, category);
}

const LEGACY_TO_TYPE = {
  server: 'protection',
  moderation: 'mod',
  members: 'joinleave',
  messages: 'message',
  channels: 'channel',
  roles: 'role',
  voice: 'voice',
  emojis: 'emoji',
  stickers: 'emoji',
  bots: 'joinleave',
  tags: 'name',
  threads: 'channel',
  invites: 'invite',
  security: 'protection',
  levels: 'level',
  tickets: 'ticket',
  general: 'mod'
};

async function logGuildEvent(guild, category, title, description, options = {}) {
  const typeKey = LEGACY_TO_TYPE[category] || 'mod';
  if (!guild || !TYPE_MAP[typeKey]) return false;
  return logEvent(guild, typeKey, {
    title,
    description,
    fields: options.fields,
    thumbnail: options.thumbnail,
    footer: options.footer,
    color: options.color,
    audit: false
  });
}

async function setupLogChannels(guild) {
  const { setupLogChannels: setup } = require('./logging/setup');
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, error: 'missing-permissions' };
  }
  const result = await setup(guild);
  return {
    ok: true,
    category: result.category,
    channels: Object.fromEntries(result.created.concat(result.reused).map(channel => [channel.name.replace(/-log$/, ''), channel.id])),
    created: result.created.length
  };
}

module.exports = {
  LOG_CATEGORIES,
  CATEGORY_KEYS,
  channelName,
  logGuildEvent,
  resolveChannel,
  setupLogChannels
};
