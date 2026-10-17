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
const COOKIES_PATH = process.env.YTDLP_COOKIES || '';
const PROBE_TIMEOUT_MS = Number(process.env.YTDLP_PROBE_TIMEOUT_MS) || 25000;
const SEARCH_RESULTS = Number(process.env.YTDLP_SEARCH_RESULTS) || 5;
const MAX_CANDIDATES = 3;

let ffmpegPath = process.env.YTDLP_FFMPEG || '';
if (!ffmpegPath) {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    ffmpegPath = ffmpegStatic?.path || ffmpegStatic || '';
  } catch {
    ffmpegPath = '';
  }
}

const queues = new Map();
const intentional = new WeakSet();

let youtubeUnavailable = false;

function commonArgs() {
  const args = [];
  if (COOKIES_PATH) args.push('--cookies', COOKIES_PATH);
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  return args;
}

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
    const child = spawn(YTDLP_PATH, [...args, ...commonArgs()], { stdio: ['ignore', 'pipe', 'pipe'] });
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

function isSoundCloudTarget(target) {
  return /soundcloud\.com/i.test(target) || /^scsearch/i.test(target);
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
    return { target: `ytsearch${SEARCH_RESULTS}:${title}`, source: 'spotify', query: title };
  }
  if (/^https?:\/\//i.test(input)) return { target: input, source: 'url', query: null };
  return { target: `ytsearch${SEARCH_RESULTS}:${input}`, source: 'search', query: input };
}

async function loadMetaList(target) {
  const output = await runYtdlp([
    '--dump-single-json', '--flat-playlist', '--no-warnings', '--no-playlist', target
  ]);
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error('Could not read the track details.');
  }
  const entries = payload.entries ? payload.entries : [payload];
  return entries.filter(Boolean).map(entry => {
    const id = entry.id || null;
    const rawUrl = typeof entry.url === 'string' && !/api\.soundcloud\.com/i.test(entry.url) ? entry.url : null;
    const url = entry.webpage_url || entry.original_url || rawUrl
      || (id ? `https://www.youtube.com/watch?v=${id}` : null);
    const duration = Number.isFinite(entry.duration) ? entry.duration : null;
    let thumbnail = entry.thumbnail || entry.thumbnails?.[0]?.url || null;
    const ytMatch = url && url.match(/[?&]v=([\w-]{6,})/);
    if (!thumbnail && ytMatch) thumbnail = `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    return { id, title: entry.title || 'Unknown title', url, duration, thumbnail };
  }).filter(meta => meta.url);
}

function probeStreamable(url) {
  return new Promise(resolve => {
    const child = spawn(YTDLP_PATH, [
      '-f', 'bestaudio/best',
      '-g',
      '--no-playlist',
      '--no-warnings',
      ...commonArgs(),
      url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    let stderr = '';
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve({ ok, error: error || '' });
    };
    const timer = setTimeout(() => finish(false, 'The audio source timed out.'), PROBE_TIMEOUT_MS);
    child.stdout.once('data', () => finish(true));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => finish(false, error.message));
    child.once('close', code => finish(false,
      stderr.trim().split('\n').filter(Boolean).pop() || `yt-dlp exited with code ${code}.`));
  });
}

function friendlySourceError(message) {
  if (/not a bot|sign in to confirm|cookies/i.test(message)) {
    return 'the audio host is asking this server to sign in';
  }
  return message;
}

async function fetchTrack(input, requestedBy) {
  const primary = await resolveTarget(input);
  const primaryProvider = isSoundCloudTarget(primary.target) ? 'soundcloud' : 'youtube';
  const canSkipPrimary = youtubeUnavailable && primaryProvider === 'youtube' && primary.query;

  const attempts = [];
  let primaryTitle = null;
  if (!canSkipPrimary) {
    try {
      const metas = await loadMetaList(primary.target);
      primaryTitle = metas[0]?.title || null;
      for (const meta of metas.slice(0, MAX_CANDIDATES)) {
        attempts.push({ meta, provider: primaryProvider, source: primary.source });
      }
    } catch { /* the fallback below may still work */ }
  }

  const fallbackQuery = primary.query || primaryTitle || null;
  if (fallbackQuery && primaryProvider !== 'soundcloud') {
    try {
      const metas = await loadMetaList(`scsearch${SEARCH_RESULTS}:${fallbackQuery}`);
      for (const meta of metas.slice(0, MAX_CANDIDATES)) {
        attempts.push({ meta, provider: 'soundcloud', source: 'soundcloud' });
      }
    } catch { /* no fallback available */ }
  }

  if (!attempts.length) throw new Error('I could not find anything for that search.');

  let lastError = 'I could not find a playable stream for that track.';
  for (const attempt of attempts) {
    if (attempt.provider === 'youtube' && youtubeUnavailable) continue;
    const probe = await probeStreamable(attempt.meta.url);
    if (probe.ok) {
      if (attempt.provider === 'youtube') youtubeUnavailable = false;
      return { ...attempt.meta, source: attempt.source, requestedBy };
    }
    if (attempt.provider === 'youtube') youtubeUnavailable = true;
    lastError = friendlySourceError(probe.error);
  }

  throw new Error(youtubeUnavailable
    ? `${lastError}. Try a different song or a SoundCloud link.`
    : lastError);
}

function destroyStream(queue) {
  if (!queue) return;
  try { queue.stream?.kill('SIGKILL'); } catch { /* already gone */ }
  try { queue.stream?.stdout?.destroy(); } catch { /* already gone */ }
  try { queue.encoder?.kill('SIGKILL'); } catch { /* already gone */ }
  try { queue.encoder?.stdin?.destroy(); } catch { /* already gone */ }
  try { queue.encoder?.stdout?.destroy(); } catch { /* already gone */ }
  queue.stream = null;
  queue.encoder = null;
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
    ...commonArgs(),
    track.url
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  queue.stream = child;
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => {
    console.error(`yt-dlp could not start for ${track.url}:`, error.message);
  });
  child.on('close', code => {
    if (code) {
      const detail = stderr.trim().split('\n').filter(Boolean).pop() || `code ${code}`;
      console.error(`yt-dlp stream failed for ${track.url}: ${detail}`);
    }
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
  fetchTrack,
  enqueue,
  skip,
  stop,
  togglePause,
  setVolume,
  getState
};
