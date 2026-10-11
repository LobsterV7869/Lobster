'use strict';

const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const db = require('../utils/database');

const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 60000;

const desired = new Map();
const reconnectTimers = new Map();
const intentional = new WeakSet();
const inflight = new Map();

function settings(guildId) {
  return db.getSettings(guildId);
}

function connectionState(guildId) {
  const connection = getVoiceConnection(guildId);
  const entry = desired.get(guildId);
  const stored = settings(guildId);
  return {
    connected: Boolean(connection && connection.state.status === VoiceConnectionStatus.Ready),
    status: connection?.state.status || 'idle',
    channelId: connection?.joinConfig?.channelId || entry?.channelId || stored.voiceChannel || null,
    autoReconnect: Boolean(entry?.autoReconnect ?? stored.voiceAutoReconnect)
  };
}

function withChannelName(guild, state) {
  const channel = state.channelId ? guild.channels.cache.get(state.channelId) : null;
  return { ...state, channelName: channel?.name || null };
}

function clearReconnect(guildId) {
  const timer = reconnectTimers.get(guildId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(guildId);
}

function destroyIntentional(connection) {
  if (!connection) return;
  intentional.add(connection);
  try { connection.destroy(); } catch { /* already destroyed */ }
}

function giveUpReconnect(guild, entry) {
  desired.set(guild.id, { ...entry, channelId: null, attempts: 0 });
  db.updateSetting(guild.id, 'voiceChannel', null);
}

function scheduleReconnect(guild) {
  const entry = desired.get(guild.id);
  if (!entry?.autoReconnect || !entry.channelId) return;
  if (reconnectTimers.has(guild.id)) return;

  const attempts = entry.attempts || 0;
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`Giving up auto-reconnect for ${guild.name} after ${attempts} failed attempts.`);
    giveUpReconnect(guild, entry);
    return;
  }

  const channel = guild.channels.cache.get(entry.channelId);
  if (!channel) {
    giveUpReconnect(guild, entry);
    return;
  }

  const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** attempts, RECONNECT_MAX_DELAY);
  desired.set(guild.id, { ...entry, attempts: attempts + 1 });
  const timer = setTimeout(() => {
    reconnectTimers.delete(guild.id);
    const current = getVoiceConnection(guild.id);
    if (current && current.state.status === VoiceConnectionStatus.Ready) return;
    connect(guild, channel, { isReconnect: true }).catch(error =>
      console.error(`Voice auto-reconnect failed for ${guild.name}:`, error));
  }, delay);
  timer.unref?.();
  reconnectTimers.set(guild.id, timer);
}

function watch(guild, connection) {
  if (process.env.VOICE_DEBUG) {
    connection.on('stateChange', (from, to) =>
      console.log(`[voice:${guild.id}] state ${from.status} -> ${to.status}`));
    connection.on('error', error =>
      console.log(`[voice:${guild.id}] error: ${error.message}`));
  }
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    const entry = desired.get(guild.id);
    if (!entry?.autoReconnect) return;
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000)
      ]);
    } catch {
      // The library could not recover it. Tear it down once and reconnect.
      try { connection.destroy(); } catch { /* already destroyed */ }
      scheduleReconnect(guild);
    }
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (intentional.has(connection)) return;
    const entry = desired.get(guild.id);
    if (entry?.autoReconnect && entry.channelId) scheduleReconnect(guild);
  });
}

async function connect(guild, channel, { isReconnect = false } = {}) {
  const pending = inflight.get(guild.id);
  if (pending) {
    const state = await pending.catch(() => null);
    if (state && state.channelId === channel.id) return state;
  }

  const existing = getVoiceConnection(guild.id);
  if (existing && existing.joinConfig.channelId === channel.id
    && existing.state.status === VoiceConnectionStatus.Ready) {
    return withChannelName(guild, connectionState(guild.id));
  }

  clearReconnect(guild.id);
  destroyIntentional(existing);

  const stored = settings(guild.id);
  const previous = desired.get(guild.id);
  desired.set(guild.id, {
    channelId: channel.id,
    autoReconnect: Boolean(previous?.autoReconnect ?? stored.voiceAutoReconnect),
    attempts: isReconnect ? (previous?.attempts || 0) : 0
  });

  const attempt = (async () => {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true
    });
    watch(guild, connection);
    db.updateSetting(guild.id, 'voiceChannel', channel.id);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    } catch {
      destroyIntentional(connection);
      db.updateSetting(guild.id, 'voiceChannel', null);
      const entry = desired.get(guild.id);
      if (isReconnect && entry?.autoReconnect && entry.channelId
        && (entry.attempts || 0) < MAX_RECONNECT_ATTEMPTS) {
        scheduleReconnect(guild);
      }
      const connectionError = new Error('Voice connection could not be confirmed within 15 seconds. Ensure Lobster has View Channel, Connect, and Speak permissions in that voice channel and that the channel is not full.');
      connectionError.status = 504;
      throw connectionError;
    }
    const entry = desired.get(guild.id);
    if (entry) desired.set(guild.id, { ...entry, attempts: 0 });
    return withChannelName(guild, connectionState(guild.id));
  })();

  inflight.set(guild.id, attempt);
  try {
    return await attempt;
  } finally {
    if (inflight.get(guild.id) === attempt) inflight.delete(guild.id);
  }
}

function disconnect(guildId) {
  clearReconnect(guildId);
  const entry = desired.get(guildId);
  if (entry) desired.set(guildId, { ...entry, channelId: null, attempts: 0 });
  destroyIntentional(getVoiceConnection(guildId));
  db.updateSetting(guildId, 'voiceChannel', null);
}

function setAutoReconnect(guildId, enabled) {
  const entry = desired.get(guildId) || {};
  desired.set(guildId, { ...entry, autoReconnect: Boolean(enabled), attempts: 0 });
  db.updateSetting(guildId, 'voiceAutoReconnect', Boolean(enabled));
  if (!enabled) clearReconnect(guildId);
  return Boolean(enabled);
}

async function restore(client) {
  for (const guild of client.guilds.cache.values()) {
    const stored = settings(guild.id);
    if (!stored.voiceAutoReconnect || !stored.voiceChannel) continue;
    let channel = guild.channels.cache.get(stored.voiceChannel);
    if (!channel) {
      channel = await guild.channels.fetch(stored.voiceChannel).catch(() => null);
    }
    if (!channel) {
      db.updateSetting(guild.id, 'voiceChannel', null);
      continue;
    }
    desired.set(guild.id, { channelId: channel.id, autoReconnect: true, attempts: 0 });
    connect(guild, channel, { isReconnect: true }).catch(error =>
      console.error(`Could not restore the voice connection for ${guild.name}:`, error));
  }
}

module.exports = {
  status: guild => withChannelName(guild, connectionState(guild.id)),
  connect,
  disconnect,
  setAutoReconnect,
  restore
};
