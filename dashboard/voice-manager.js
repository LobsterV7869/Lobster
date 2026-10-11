'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const prism = require('prism-media');
const ffmpegPath = require('ffmpeg-static');
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  EndBehaviorType
} = require('@discordjs/voice');
const db = require('../utils/database');

const RECORDINGS_DIR = path.join(__dirname, '..', 'data', 'recordings');
const recordings = new Map();

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
  const session = recordings.get(guildId);
  return {
    connected: Boolean(connection && connection.state.status === VoiceConnectionStatus.Ready),
    status: connection?.state.status || 'idle',
    channelId: connection?.joinConfig?.channelId || entry?.channelId || stored.voiceChannel || null,
    autoReconnect: Boolean(entry?.autoReconnect ?? stored.voiceAutoReconnect),
    selfMute: Boolean(connection?.joinConfig?.selfMute),
    selfDeaf: Boolean(connection?.joinConfig?.selfDeaf ?? true),
    recording: session
      ? {
          active: true,
          id: session.id,
          since: session.startedAt,
          participants: session.streams.size
        }
      : { active: false, id: null, since: null, participants: 0 }
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
  stopRecordingQuietly(guildId);
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

function setSelfMute(guildId, mute) {
  const connection = getVoiceConnection(guildId);
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
    const error = new Error('Lobster is not connected to a voice channel.');
    error.status = 409;
    throw error;
  }
  connection.rejoin({ selfMute: Boolean(mute) });
  return connectionState(guildId);
}

function setSelfDeaf(guildId, deaf) {
  const connection = getVoiceConnection(guildId);
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
    const error = new Error('Lobster is not connected to a voice channel.');
    error.status = 409;
    throw error;
  }
  connection.rejoin({ selfDeaf: Boolean(deaf) });
  return connectionState(guildId);
}

function subscribeRecordingUser(session, guild, userId) {
  if (session.streams.has(userId)) return;
  let opus;
  try {
    opus = session.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual }
    });
  } catch {
    return;
  }
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const file = path.join(session.dir, `${userId}.ogg`);
  const ffmpeg = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-i', 'pipe:0',
    '-c:a', 'libopus', '-b:a', '64k',
    '-y', file
  ], { stdio: ['pipe', 'ignore', 'ignore'] });
  const entry = {
    userId,
    file,
    opus,
    decoder,
    ffmpeg,
    finished: new Promise(resolve => ffmpeg.once('close', resolve))
  };
  session.streams.set(userId, entry);
  opus.on('error', () => {});
  decoder.on('error', () => {});
  ffmpeg.stdin.on('error', () => {});
  opus.pipe(decoder).pipe(ffmpeg.stdin);
}

function recordStart(guild) {
  const connection = getVoiceConnection(guild.id);
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
    const error = new Error('Lobster must be connected to a voice channel before recording.');
    error.status = 409;
    throw error;
  }
  if (recordings.has(guild.id)) {
    const error = new Error('A recording is already in progress for this server.');
    error.status = 409;
    throw error;
  }
  if (connection.joinConfig.selfDeaf) {
    connection.rejoin({ selfDeaf: false });
  }
  const id = String(Date.now());
  const dir = path.join(RECORDINGS_DIR, guild.id, id);
  fs.mkdirSync(dir, { recursive: true });
  const session = {
    id,
    dir,
    startedAt: Date.now(),
    connection,
    streams: new Map(),
    onSpeaking: null
  };
  session.onSpeaking = userId => subscribeRecordingUser(session, guild, userId);
  connection.receiver.speaking.on('start', session.onSpeaking);
  const channel = connection.joinConfig.channelId
    ? guild.channels.cache.get(connection.joinConfig.channelId)
    : null;
  if (channel) {
    for (const member of channel.members.values()) {
      if (!member.user.bot) subscribeRecordingUser(session, guild, member.id);
    }
  }
  recordings.set(guild.id, session);
  return connectionState(guild.id);
}

async function recordStop(guild) {
  const session = recordings.get(guild.id);
  if (session) {
    recordings.delete(guild.id);
    if (session.onSpeaking) session.connection.receiver.speaking.off('start', session.onSpeaking);
    for (const entry of session.streams.values()) {
      try { entry.opus.destroy(); } catch { /* stream already ended */ }
      try { entry.decoder.end(); } catch { /* stream already ended */ }
    }
    await Promise.allSettled([...session.streams.values()].map(entry => entry.finished));
  }
  return connectionState(guild.id);
}

function stopRecordingQuietly(guildId) {
  const session = recordings.get(guildId);
  if (!session) return;
  recordings.delete(guildId);
  if (session.onSpeaking) session.connection.receiver.speaking.off('start', session.onSpeaking);
  for (const entry of session.streams.values()) {
    try { entry.opus.destroy(); } catch { /* stream already ended */ }
    try { entry.decoder.end(); } catch { /* stream already ended */ }
    entry.finished.catch(() => {});
  }
}

function listRecordings(guildId, guild = null) {
  const base = path.join(RECORDINGS_DIR, guildId);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(item => item.isDirectory() && /^\d{10,}$/.test(item.name))
    .map(item => {
      const dir = path.join(base, item.name);
      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.ogg'))
        .map(file => {
          const userId = file.replace(/\.ogg$/, '');
          const stat = fs.statSync(path.join(dir, file));
          return {
            userId,
            name: guild?.members?.cache?.get(userId)?.displayName || userId,
            file,
            size: stat.size,
            mtime: stat.mtimeMs
          };
        })
        .filter(entry => entry.size > 0)
        .sort((a, b) => a.mtime - b.mtime);
      return { id: item.name, startedAt: Number(item.name) || null, files };
    })
    .filter(session => session.files.length > 0)
    .sort((a, b) => b.id.localeCompare(a.id));
}

function resolveRecordingFile(guildId, sessionId, file) {
  if (!/^\d{10,}$/.test(sessionId)) return null;
  if (!/^\d{17,20}\.ogg$/.test(file)) return null;
  const base = path.join(RECORDINGS_DIR, guildId);
  const candidate = path.join(base, sessionId, file);
  if (!candidate.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(candidate)) return null;
  return candidate;
}

module.exports = {
  status: guild => withChannelName(guild, connectionState(guild.id)),
  connect,
  disconnect,
  setAutoReconnect,
  restore,
  setSelfMute,
  setSelfDeaf,
  recordStart,
  recordStop,
  stopRecordingQuietly,
  listRecordings,
  resolveRecordingFile
};
