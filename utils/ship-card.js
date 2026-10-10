const { spawn } = require('node:child_process');

const WIDTH = 1200;
const HEIGHT = 675;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function displayName(user) {
  return Array.from(user.globalName || user.displayName || user.username || 'Discord user')
    .slice(0, 22)
    .join('');
}

async function downloadAvatar(user) {
  const avatarUrl = new URL(user.displayAvatarURL({ extension: 'png', size: 256 }));
  if (avatarUrl.protocol !== 'https:' || avatarUrl.hostname !== 'cdn.discordapp.com') {
    throw new Error('Discord returned an unsupported avatar URL.');
  }
  const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Discord avatar request failed (${response.status}).`);
  if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'image/png') {
    throw new Error('Discord returned an invalid avatar image.');
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_AVATAR_BYTES) {
    throw new Error('The avatar image is too large to render.');
  }
  if (!response.body) throw new Error('Discord returned an empty avatar image.');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AVATAR_BYTES) {
        await reader.cancel();
        throw new Error('The avatar image is too large to render.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('Discord returned an empty avatar image.');
  return Buffer.concat(chunks);
}

function cardSvg(first, second, score, avatars) {
  const stars = [
    [85, 83, 3], [198, 148, 2], [1070, 92, 3], [1106, 190, 2],
    [74, 338, 2], [1132, 420, 3], [213, 560, 2], [1002, 570, 2],
    [330, 88, 2], [850, 122, 2], [940, 514, 3], [283, 462, 2]
  ].map(([x, y, radius]) =>
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff0fa" opacity=".8"/>`
  ).join('');
  const leftName = escapeXML(displayName(first));
  const rightName = escapeXML(displayName(second));
  const leftAvatar = avatars[0].toString('base64');
  const rightAvatar = avatars[1].toString('base64');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#250c35"/><stop offset=".5" stop-color="#651b50"/><stop offset="1" stop-color="#29103d"/></linearGradient>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#71294f" stop-opacity=".9"/><stop offset="1" stop-color="#32152f" stop-opacity=".95"/></linearGradient>
      <linearGradient id="heart" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffb1d2"/><stop offset="1" stop-color="#f33885"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#ff80bf" stop-opacity=".45"/><stop offset="1" stop-color="#ff80bf" stop-opacity="0"/></radialGradient>
      <clipPath id="leftClip"><circle cx="314" cy="314" r="100"/></clipPath>
      <clipPath id="rightClip"><circle cx="886" cy="314" r="100"/></clipPath>
    </defs>
    <rect width="1200" height="675" rx="34" fill="url(#bg)"/>
    <circle cx="590" cy="325" r="325" fill="url(#glow)"/>
    ${stars}
    <rect x="30" y="30" width="1140" height="615" rx="28" fill="none" stroke="#ffafd5" stroke-opacity=".34" stroke-width="2"/>
    <text x="600" y="130" text-anchor="middle" fill="#ffc6e1" font-family="DejaVu Sans, sans-serif" font-size="23" letter-spacing="9">LOBSTER PRESENTS</text>
    <text x="600" y="221" text-anchor="middle" fill="#fff1f8" font-family="DejaVu Sans, sans-serif" font-size="76" font-weight="700">SHIP</text>
    <rect x="95" y="255" width="390" height="294" rx="30" fill="url(#panel)" stroke="#fa85b8" stroke-opacity=".75" stroke-width="3"/>
    <rect x="715" y="255" width="390" height="294" rx="30" fill="url(#panel)" stroke="#fa85b8" stroke-opacity=".75" stroke-width="3"/>
    <circle cx="314" cy="314" r="108" fill="#ffabd2" opacity=".4"/>
    <circle cx="886" cy="314" r="108" fill="#ffabd2" opacity=".4"/>
    <image x="214" y="214" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#leftClip)" href="data:image/png;base64,${leftAvatar}" xlink:href="data:image/png;base64,${leftAvatar}"/>
    <image x="786" y="214" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#rightClip)" href="data:image/png;base64,${rightAvatar}" xlink:href="data:image/png;base64,${rightAvatar}"/>
    <circle cx="314" cy="314" r="103" fill="none" stroke="#ffe3f0" stroke-width="5"/>
    <circle cx="886" cy="314" r="103" fill="none" stroke="#ffe3f0" stroke-width="5"/>
    <text x="290" y="475" text-anchor="middle" fill="#fff3fa" font-family="DejaVu Sans, sans-serif" font-size="32" font-weight="700">${leftName}</text>
    <text x="910" y="475" text-anchor="middle" fill="#fff3fa" font-family="DejaVu Sans, sans-serif" font-size="32" font-weight="700">${rightName}</text>
    <path d="M600 320 C565 278 500 305 520 353 C536 390 600 429 600 429 C600 429 664 390 680 353 C700 305 635 278 600 320Z" fill="url(#heart)" stroke="#ffe1ed" stroke-width="5"/>
    <text x="600" y="369" text-anchor="middle" fill="#fff" font-family="DejaVu Sans, sans-serif" font-size="43" font-weight="700">${score}%</text>
    <text x="600" y="502" text-anchor="middle" fill="#ffbfdc" font-family="DejaVu Sans, sans-serif" font-size="21" letter-spacing="4">COMPATIBILITY</text>
    <text x="600" y="602" text-anchor="middle" fill="#ffeaf4" font-family="DejaVu Sans, sans-serif" font-size="21">A just-for-fun duo vibe check ✦</text>
  </svg>`;
}

function renderPng(svg) {
  return new Promise((resolve, reject) => {
    const args = [
      '-limit', 'memory', '128MiB',
      '-limit', 'map', '256MiB',
      '-limit', 'time', '15',
      '-background', '#250c35',
      'svg:-',
      '-strip',
      '-define', 'png:compression-level=8',
      'png:-'
    ];
    const chunks = [];
    let outputBytes = 0;
    let stderr = '';
    let renderer;
    let settled = false;
    const timeout = setTimeout(() => renderer.kill('SIGKILL'), 20_000);
    const finish = (error, image) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(image);
    };
    const launch = (executable, allowFallback) => {
      renderer = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const current = renderer;
      current.stdout.on('data', chunk => {
        if (renderer !== current || settled) return;
        outputBytes += chunk.length;
        if (outputBytes > MAX_IMAGE_BYTES) {
          current.kill('SIGKILL');
          return;
        }
        chunks.push(chunk);
      });
      current.stderr.on('data', chunk => {
        if (renderer === current && stderr.length < 4000) {
          stderr += chunk.toString().slice(0, 4000 - stderr.length);
        }
      });
      current.once('error', error => {
        if (renderer !== current || settled) return;
        if (allowFallback && error.code === 'ENOENT') {
          launch('convert', false);
        } else if (error.code === 'ENOENT') {
          finish(new Error('The ship card image renderer (ImageMagick) is not installed on the bot host.'));
        } else {
          finish(error);
        }
      });
      current.once('close', code => {
        if (renderer !== current || settled) return;
        if (code !== 0 || !outputBytes) {
          finish(new Error(`Could not render ship card${stderr ? `: ${stderr.trim()}` : '.'}`));
          return;
        }
        finish(null, Buffer.concat(chunks, outputBytes));
      });
      current.stdin.end(svg);
    };
    launch(process.platform === 'win32' ? 'magick.exe' : 'magick', process.platform !== 'win32');
  });
}

async function createShipCard(first, second, score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error('Compatibility score must be between 0 and 100.');
  }
  const avatars = await Promise.all([downloadAvatar(first), downloadAvatar(second)]);
  return renderPng(cardSvg(first, second, score, avatars));
}

module.exports = { createShipCard };
