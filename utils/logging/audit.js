const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');

const ACTION_TYPES = {
  ban: ['MemberBanAdd', 'MemberBanRemove'],
  kick: ['MemberKick'],
  timeout: ['MemberUpdate'],
  mod: ['MemberUpdate', 'MemberPrune'],
  protection: [
    'AutoModerationRuleCreate', 'AutoModerationRuleUpdate', 'AutoModerationRuleDelete',
    'AutoModerationBlockMessage', 'AutoModerationFlagToChannel',
    'WebhookCreate', 'WebhookUpdate', 'WebhookDelete', 'GuildUpdate'
  ],
  role: ['RoleCreate', 'RoleUpdate', 'RoleDelete', 'MemberRoleUpdate'],
  emoji: ['EmojiCreate', 'EmojiUpdate', 'EmojiDelete', 'StickerCreate', 'StickerUpdate', 'StickerDelete'],
  ticket: [],
  message: ['MessageDelete', 'MessageBulkDelete'],
  level: [],
  name: ['MemberUpdate'],
  voice: [],
  channel: [
    'ChannelCreate', 'ChannelUpdate', 'ChannelDelete',
    'ChannelOverwriteCreate', 'ChannelOverwriteUpdate', 'ChannelOverwriteDelete',
    'ThreadCreate', 'ThreadUpdate', 'ThreadDelete'
  ],
  invite: ['InviteCreate', 'InviteUpdate', 'InviteDelete'],
  joinleave: [],
  reaction: []
};

function resolveActions(typeKey, extraNames = []) {
  const names = [...(ACTION_TYPES[typeKey] || []), ...extraNames];
  return [...new Set(names)]
    .map(name => AuditLogEvent[name])
    .filter(value => Number.isInteger(value));
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function findEntry(guild, actions, targetId, maxAge) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 15 });
    const now = Date.now();
    return logs.entries.find(item => {
      if (!actions.includes(item.action)) return false;
      if (now - item.createdTimestamp > maxAge) return false;
      if (targetId && item.targetId && item.targetId !== String(targetId)) return false;
      return true;
    }) || null;
  } catch {
    return null;
  }
}

async function fetchAuditDetails(guild, typeKey, targetId = null, options = {}) {
  if (!guild || !guild.members.me) return null;
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  const actions = resolveActions(typeKey, options.extraActions || []);
  if (!actions.length) return null;
  const maxAge = Number.isFinite(options.maxAge) ? options.maxAge : 25000;
  const attempts = Number.isFinite(options.attempts) ? Math.max(1, options.attempts) : 2;
  const retryDelay = Number.isFinite(options.retryDelay) ? options.retryDelay : 900;

  let entry = null;
  for (let attempt = 0; attempt < attempts && !entry; attempt += 1) {
    if (attempt > 0) await wait(retryDelay);
    entry = await findEntry(guild, actions, targetId, maxAge);
  }
  if (!entry) return null;
  return {
    action: entry.action,
    executorId: entry.executorId,
    executorTag: entry.executor?.tag || null,
    executor: entry.executor || null,
    executorBot: Boolean(entry.executor?.bot),
    reason: entry.reason ? entry.reason.slice(0, 500) : null,
    targetId: entry.targetId
  };
}

module.exports = { ACTION_TYPES, fetchAuditDetails };
