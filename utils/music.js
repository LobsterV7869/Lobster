'use strict';

const { spawn } = require('node:child_process');
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType
} = require('@discordjs/voice');

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const IDLE_LEAVE_MS = 60000;

const queues = new Map();
const intentional = new WeakSet();

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'live';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const pad = value => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => {
      reject(error.code === 'ENOENT'
        ? new Error('yt-dlp is not installed on the bot host. Install it or set YTDLP_PATH.')
        : error);
    });
    child.once('close', code => {
      if (code !== 0) {
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine || `yt-dlp exited with code ${code}.`));
      }
      resolve(stdout);
    });
  });
}

async function resolveTarget(input) {
  if (/open\.spotify\.com/i.test(input)) {
    const parsed = new URL(input);
    const kind = parsed.pathname.split('/').filter(Boolean)[0];
    if (kind !== 'track') {
      throw new Error('Only Spotify **track** links are supported. Paste a single song link.');
    }
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(input)}`);
    if (!response.ok) throw new Error('Could not read that Spotify track.');
    const { title } = await response.json();
    if (!title) throw new Error('Could not read that Spotify track.');
    return { target: `ytsearch1:${title}`, source: 'spotify' };
  }
  if (/^https?:\/\//i.test(input)) return { target: input, source: 'url' };
  return { target: `ytsearch1:${input}`, source: 'search' };
}

async function fetchTrack(input, requestedBy) {
  const { target, source } = await resolveTarget(input);
  const output = await runYtdlp([
    '--dump-single-json', '--flat-playlist', '--no-warnings', '--no-playlist', target
  ]);
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error('Could not read the track details.');
  }
  const entry = payload.entries ? payload.entries[0] : payload;
  if (!entry) throw new Error('I could not find anything for that search.');
  const id = entry.id || null;
  const url = entry.url || (id ? `https://www.youtube.com/watch?v=${id}` : null);
  if (!url) throw new Error('I could not resolve a playable URL for that track.');
  const duration = Number.isFinite(entry.duration) ? entry.duration : null;
  const thumbnail = entry.thumbnail
    || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);
  return {
    id,
    title: entry.title || 'Unknown title',
    url,
    duration,
    thumbnail,
    source,
    requestedBy
  };
}

function destroyStream(queue) {
  if (!queue?.stream) return;
  try { queue.stream.kill('SIGKILL'); } catch { /* already gone */ }
  try { queue.stream.stdout?.destroy(); } catch { /* already gone */ }
  queue.stream = null;
}

function destroyConnection(connection) {
  if (!connection) return;
  intentional.add(connection);
  try { connection.destroy(); } catch { /* already destroyed */ }
}

function cleanupQueue(guildId, queue) {
  if (queues.get(guildId) !== queue) return;
  if (queue.leaveTimer) clearTimeout(queue.leaveTimer);
  destroyStream(queue);
  queue.playing = false;
  queue.current = null;
  queue.tracks = [];
  queues.delete(guildId);
  queue.player.removeAllListeners();
  try { queue.player.stop(true); } catch { /* already idle */ }
}

function attachConnection(guild, queue, connection) {
  if (queue.connection === connection) return;
  connection.subscribe(queue.player);
  queue.connection = connection;
  connection.once(VoiceConnectionStatus.Destroyed, () => {
    if (intentional.has(connection)) return;
    cleanupQueue(guild.id, queue);
  });
}

async function ensureConnection(guild, voiceChannel, queue) {
  const existing = getVoiceConnection(guild.id);
  if (existing
    && existing.joinConfig.channelId === voiceChannel.id
    && existing.state.status === VoiceConnectionStatus.Ready) {
    return existing;
  }
  if (existing) {
    intentional.add(existing);
    try { existing.destroy(); } catch { /* already destroyed */ }
    queue.connection = null;
  }
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  } catch {
    try { connection.destroy(); } catch { /* already destroyed */ }
    throw new Error('I could not join your voice channel. Check that I have View Channel, Connect, and Speak permissions there.');
  }
  return connection;
}

function startTrack(guild, queue, track) {
  queue.current = track;
  queue.playing = true;
  const child = spawn(YTDLP_PATH, [
    '-f', 'bestaudio/best',
    '-o', '-',
    '--no-playlist',
    '--no-warnings',
    track.url
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  queue.stream = child;
  child.on('error', error => {
    console.error(`yt-dlp could not start for ${track.url}:`, error.message);
  });
  const resource = createAudioResource(child.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
    metadata: track
  });
  if (resource.volume) resource.volume.setVolume(queue.volume);
  queue.resource = resource;
  queue.player.play(resource);
}

function scheduleLeave(guild, queue) {
  if (queue.leaveTimer) clearTimeout(queue.leaveTimer);
  queue.leaveTimer = setTimeout(() => {
    const current = queues.get(guild.id);
    if (!current || current.playing) return;
    destroyConnection(current.connection);
    cleanupQueue(guild.id, current);
  }, IDLE_LEAVE_MS);
  queue.leaveTimer.unref?.();
}

function advance(guild) {
  const queue = queues.get(guild.id);
  if (!queue) return;
  destroyStream(queue);
  const next = queue.tracks.shift();
  if (!next) {
    queue.current = null;
    queue.playing = false;
    scheduleLeave(guild, queue);
    return;
  }
  startTrack(guild, queue, next);
}

function createQueue(guild) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });
  const queue = {
    guildId: guild.id,
    connection: null,
    player,
    tracks: [],
    current: null,
    resource: null,
    stream: null,
    volume: 1,
    playing: false,
    leaveTimer: null
  };
  player.on(AudioPlayerStatus.Idle, () => advance(guild));
  player.on('error', error => {
    console.error(`Music player error in ${guild.id}:`, error.message);
  });
  return queue;
}

async function enqueue({ guild, voiceChannel, query, user, playNext = false }) {
  const track = await fetchTrack(query, user.id);
  let queue = queues.get(guild.id);
  if (!queue) {
    queue = createQueue(guild);
    queues.set(guild.id, queue);
  }
  if (queue.leaveTimer) {
    clearTimeout(queue.leaveTimer);
    queue.leaveTimer = null;
  }
  let connection;
  try {
    connection = await ensureConnection(guild, voiceChannel, queue);
  } catch (error) {
    if (!queue.playing && !queue.current && queue.tracks.length === 0) {
      queues.delete(guild.id);
      queue.player.removeAllListeners();
    }
    throw error;
  }
  attachConnection(guild, queue, connection);

  let position;
  if (playNext) {
    queue.tracks.unshift(track);
    position = 1;
  } else {
    queue.tracks.push(track);
    position = queue.tracks.length;
  }
  if (!queue.playing) {
    advance(guild);
    position = 0;
  }
  return { track, position };
}

function skip(guild) {
  const queue = queues.get(guild.id);
  if (!queue?.playing || !queue.current) return null;
  const previous = queue.current.title;
  queue.player.stop();
  return { skipped: previous };
}

function stop(guild) {
  const queue = queues.get(guild.id);
  if (!queue) return false;
  if (queue.leaveTimer) clearTimeout(queue.leaveTimer);
  queues.delete(guild.id);
  destroyStream(queue);
  queue.tracks = [];
  queue.current = null;
  queue.playing = false;
  try { queue.player.stop(true); } catch { /* already idle */ }
  queue.player.removeAllListeners();
  destroyConnection(queue.connection || getVoiceConnection(guild.id));
  return true;
}

function togglePause(guild) {
  const queue = queues.get(guild.id);
  if (!queue?.playing) return null;
  const status = queue.player.state.status;
  if (status === AudioPlayerStatus.Paused) {
    queue.player.unpause();
    return 'resumed';
  }
  if (status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering) {
    queue.player.pause();
    return 'paused';
  }
  return null;
}

function setVolume(guild, value) {
  const queue = queues.get(guild.id);
  if (!queue) return null;
  queue.volume = value;
  if (queue.resource?.volume) queue.resource.volume.setVolume(value);
  return value;
}

function getState(guild) {
  const queue = queues.get(guild.id);
  if (!queue) return null;
  return {
    current: queue.current,
    tracks: [...queue.tracks],
    volume: queue.volume,
    playing: queue.playing,
    paused: queue.player.state.status === AudioPlayerStatus.Paused
  };
}

module.exports = {
  formatDuration,
  enqueue,
  skip,
  stop,
  togglePause,
  setVolume,
  getState
};
