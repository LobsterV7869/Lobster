const { PermissionFlagsBits } = require('discord.js');
const { TYPE_MAP } = require('./categories');
const {
  getLogConfig,
  disableType,
  setTypeError
} = require('./config');
const { buildEventEmbed } = require('./embeds');
const { fetchAuditDetails } = require('./audit');
const { enqueue } = require('./queue');

function memberRoleIds(member) {
  if (!member?.roles?.cache) return [];
  return [...member.roles.cache.keys()];
}

function shouldIgnore(typeConfig, payload) {
  if (!typeConfig) return true;
  const channelId = payload.channelId || payload.channel?.id || null;
  if (channelId && typeConfig.ignoredChannels.includes(channelId)) return true;

  const userId = payload.userId || payload.member?.id || payload.user?.id || null;
  if (userId && typeConfig.ignoredUsers.includes(userId)) return true;

  const roleIds = payload.roleIds || memberRoleIds(payload.member);
  if (roleIds.length && roleIds.some(id => typeConfig.ignoredRoles.includes(id))) return true;

  const isBot = payload.bot ?? payload.member?.user?.bot ?? payload.user?.bot ?? false;
  if (typeConfig.ignoreBots && isBot) return true;

  return false;
}

function resolveChannel(guild, typeConfig, config) {
  const channelId = typeConfig.channelId || config.fallbackChannelId;
  if (!channelId) return { channel: null, reason: 'not-configured' };
  const channel = guild?.channels?.cache?.get(channelId);
  if (!channel || !channel.isTextBased()) {
    return { channel: null, reason: 'missing' };
  }
  const me = guild.members?.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { channel: null, reason: 'permissions' };
  }
  return { channel, reason: null };
}

function disableReason(reason) {
  if (reason === 'permissions') {
    return 'Logging was disabled automatically: Lobster is missing View Channel, Send Messages, or Embed Links in the configured channel.';
  }
  return 'Logging was disabled automatically: the configured log channel was deleted or is no longer a text channel.';
}

function handleChannelRemoval(guild, channelId) {
  if (!guild || !channelId) return false;
  try {
    const config = getLogConfig(guild.id);
    let changed = false;
    for (const [typeKey, typeConfig] of Object.entries(config.types)) {
      if (!typeConfig?.enabled) continue;
      const usesChannel = typeConfig.channelId === channelId
        || (!typeConfig.channelId && config.fallbackChannelId === channelId);
      if (!usesChannel) continue;
      disableType(guild.id, typeKey, disableReason('missing'));
      changed = true;
      console.warn(`Disabled ${typeKey} logs in ${guild.name || guild.id} (${guild.id}): log channel ${channelId} was deleted.`);
    }
    return changed;
  } catch (error) {
    console.error(`Could not disable logging for deleted channel ${channelId}:`, error);
    return false;
  }
}

function deliveryFailure(guild, typeKey, error) {
  try {
    const code = error?.code;
    const fatal = code === 10003 || code === 10008 || code === 50001 || code === 50013;
    if (fatal) {
      disableType(guild.id, typeKey, `Logging was disabled automatically: ${error?.message || 'the log channel is unavailable'}.`);
      console.warn(`Disabled ${typeKey} logs in ${guild.name || guild.id} (${guild.id}): ${error?.message || error}`);
      return;
    }
    setTypeError(guild.id, typeKey, error?.message || 'Log delivery failed.');
  } catch (failure) {
    console.error(`Could not record a log delivery failure for ${typeKey}:`, failure);
  }
}

function normalizeExecutor(payload) {
  if (payload.executorId) {
    return {
      executorId: payload.executorId,
      executorTag: payload.executorTag || null
    };
  }
  if (payload.executor && typeof payload.executor === 'object') {
    return {
      executorId: payload.executor.id || null,
      executorTag: payload.executor.tag || null
    };
  }
  if (typeof payload.executor === 'string') {
    return { executorId: null, executorTag: payload.executor };
  }
  return { executorId: null, executorTag: null };
}

async function logEvent(guild, typeKey, payload = {}) {
  try {
    const type = TYPE_MAP[typeKey];
    if (!guild || !type) return false;
    const config = getLogConfig(guild.id);
    if (!config.enabled) return false;
    const typeConfig = config.types[typeKey];
    if (!typeConfig?.enabled) return false;
    if (shouldIgnore(typeConfig, payload)) return false;

    const resolved = resolveChannel(guild, typeConfig, config);
    if (!resolved.channel) {
      if (resolved.reason && resolved.reason !== 'not-configured') {
        const reason = disableReason(resolved.reason);
        disableType(guild.id, typeKey, reason);
        console.warn(`Disabled ${typeKey} logs in ${guild?.name || guild.id} (${guild.id}): ${reason}`);
      }
      return false;
    }

    let audit = null;
    if (payload.audit !== false && !payload.executorId && !payload.executor) {
      audit = await fetchAuditDetails(guild, typeKey, payload.auditTargetId || payload.targetId, {
        extraActions: payload.auditActions
      });
    }
    if (typeConfig.ignoreBots && audit?.executorBot) return false;

    const executor = normalizeExecutor(payload);
    const executorId = executor.executorId || audit?.executorId || null;
    const executorTag = executor.executorTag || audit?.executorTag || null;
    const reason = payload.reason || audit?.reason || null;

    const embed = payload.embed || buildEventEmbed(type, {
      ...payload,
      executorId,
      executorTag,
      reason
    });

    return enqueue(resolved.channel.id, async () => {
      try {
        return await resolved.channel.send({
          embeds: [embed],
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        deliveryFailure(guild, typeKey, error);
        throw error;
      }
    });
  } catch (error) {
    console.error(`Could not write ${typeKey} log for guild ${guild?.id || 'unknown'}:`, error);
    return false;
  }
}

module.exports = {
  shouldIgnore,
  resolveChannel,
  handleChannelRemoval,
  logEvent
};
