'use strict';

const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const db = require('../utils/database');

const desired = new Map();

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

function scheduleReconnect(guild) {
  const entry = desired.get(guild.id);
  if (!entry?.autoReconnect || !entry.channelId) return;
  const channel = guild.channels.cache.get(entry.channelId);
  if (!channel) {
    desired.delete(guild.id);
    return;
  }
  setTimeout(() => {
    const current = getVoiceConnection(guild.id);
    if (current && current.state.status === VoiceConnectionStatus.Ready) return;
    connect(guild, channel).catch(error =>
      console.error(`Voice auto-reconnect failed for ${guild.name}:`, error));
  }, 3000);
}

function watch(guild, connection) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    const entry = desired.get(guild.id);
    if (!entry?.autoReconnect) return;
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000)
      ]);
    } catch {
      try { connection.destroy(); } catch { /* already destroyed */ }
      scheduleReconnect(guild);
    }
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    const entry = desired.get(guild.id);
    if (entry?.autoReconnect && entry.channelId) scheduleReconnect(guild);
  });
}

async function connect(guild, channel) {
  const existing = getVoiceConnection(guild.id);
  if (existing && existing.joinConfig.channelId === channel.id
    && existing.state.status === VoiceConnectionStatus.Ready) {
    return withChannelName(guild, connectionState(guild.id));
  }
  if (existing) {
    try { existing.destroy(); } catch { /* already destroyed */ }
  }
  const stored = settings(guild.id);
  desired.set(guild.id, {
    channelId: channel.id,
    autoReconnect: Boolean(desired.get(guild.id)?.autoReconnect ?? stored.voiceAutoReconnect)
  });
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
    // The connection can still become ready shortly after; report the live state either way.
  }
  return withChannelName(guild, connectionState(guild.id));
}

function disconnect(guildId) {
  const entry = desired.get(guildId);
  if (entry) desired.set(guildId, { ...entry, channelId: null, autoReconnect: entry.autoReconnect });
  const connection = getVoiceConnection(guildId);
  if (connection) {
    try { connection.destroy(); } catch { /* already destroyed */ }
  }
  db.updateSetting(guildId, 'voiceChannel', null);
}

function setAutoReconnect(guildId, enabled) {
  const entry = desired.get(guildId) || {};
  desired.set(guildId, { ...entry, autoReconnect: Boolean(enabled) });
  db.updateSetting(guildId, 'voiceAutoReconnect', Boolean(enabled));
  return Boolean(enabled);
}

async function restore(client) {
  for (const guild of client.guilds.cache.values()) {
    const stored = settings(guild.id);
    if (!stored.voiceAutoReconnect || !stored.voiceChannel) continue;
    const channel = guild.channels.cache.get(stored.voiceChannel);
    if (!channel) {
      db.updateSetting(guild.id, 'voiceChannel', null);
      continue;
    }
    desired.set(guild.id, { channelId: channel.id, autoReconnect: true });
    connect(guild, channel).catch(error =>
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
