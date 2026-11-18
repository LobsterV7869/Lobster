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
    .slice(0, 18)
    .join('');
}

function compatibilityMood(score) {
  if (score >= 90) return 'Soulmate sparks';
  if (score >= 75) return 'Sweet chemistry';
  if (score >= 50) return 'Cute connection';
  if (score >= 25) return 'Playful crush';
  return 'Bestie hearts';
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

function heartPath(x, y, s) {
  return `M ${x} ${y + 0.28 * s} C ${x} ${y - 0.05 * s}, ${x - 0.5 * s} ${y - 0.05 * s}, ${x - 0.5 * s} ${y + 0.28 * s} C ${x - 0.5 * s} ${y + 0.58 * s}, ${x - 0.1 * s} ${y + 0.78 * s}, ${x} ${y + s} C ${x + 0.1 * s} ${y + 0.78 * s}, ${x + 0.5 * s} ${y + 0.58 * s}, ${x + 0.5 * s} ${y + 0.28 * s} C ${x + 0.5 * s} ${y - 0.05 * s}, ${x} ${y - 0.05 * s}, ${x} ${y + 0.28 * s} Z`;
}

function cardSvg(first, second, score, avatars) {
  const leftName = escapeXML(displayName(first));
  const rightName = escapeXML(displayName(second));
  const mood = escapeXML(compatibilityMood(score));
  const leftAvatar = avatars[0].toString('base64');
  const rightAvatar = avatars[1].toString('base64');
  const barWidth = 520;
  const fillWidth = Math.max(18, Math.round((score / 100) * barWidth));

  const sparkles = [
    [90, 92, 3, 0.9], [145, 150, 2, 0.7], [220, 85, 2.5, 0.8], [300, 140, 2, 0.65],
    [980, 90, 3, 0.85], [1040, 150, 2, 0.7], [1110, 100, 2.5, 0.8], [900, 160, 2, 0.6],
    [120, 560, 2.5, 0.7], [260, 610, 2, 0.55], [940, 560, 2.5, 0.7], [1080, 610, 2, 0.55],
    [560, 70, 2, 0.55], [640, 95, 2.5, 0.6], [600, 120, 1.8, 0.5]
  ].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff4fb" opacity="${o}"/>`).join('');

  const floatingHearts = [
    [70, 250, 16, '#ff8fbc', 0.35],
    [150, 420, 12, '#ffd1e6', 0.28],
    [1125, 250, 16, '#ff8fbc', 0.35],
    [1045, 420, 12, '#ffd1e6', 0.28],
    [455, 155, 10, '#ffb3d1', 0.22],
    [745, 155, 10, '#ffb3d1', 0.22],
    [520, 520, 11, '#ff9fc8', 0.18],
    [680, 520, 11, '#ff9fc8', 0.18]
  ].map(([x, y, s, c, o]) => `<path d="${heartPath(x, y, s)}" fill="${c}" opacity="${o}"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a0b2e"/>
        <stop offset="45%" stop-color="#4a123f"/>
        <stop offset="100%" stop-color="#7a1d4a"/>
      </linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.06"/>
      </linearGradient>
      <linearGradient id="heartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffd3e7"/>
        <stop offset="45%" stop-color="#ff77b0"/>
        <stop offset="100%" stop-color="#ff3d7f"/>
      </linearGradient>
      <linearGradient id="barFill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ff7ab8"/>
        <stop offset="50%" stop-color="#ff4f95"/>
        <stop offset="100%" stop-color="#ffd166"/>
      </linearGradient>
      <radialGradient id="glowPink" cx="50%" cy="45%" r="50%">
        <stop offset="0%" stop-color="#ff7fc0" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#ff7fc0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowWarm" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffd166" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#ffd166" stop-opacity="0"/>
      </radialGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#120414" flood-opacity="0.35"/>
      </filter>
      <clipPath id="leftClip"><circle cx="290" cy="330" r="98"/></clipPath>
      <clipPath id="rightClip"><circle cx="910" cy="330" r="98"/></clipPath>
    </defs>

    <rect width="1200" height="675" rx="34" fill="url(#bg)"/>
    <circle cx="600" cy="330" r="360" fill="url(#glowPink)"/>
    <circle cx="600" cy="360" r="240" fill="url(#glowWarm)"/>
    ${sparkles}
    ${floatingHearts}

    <rect x="34" y="34" width="1132" height="607" rx="30" fill="none" stroke="#ffd6e8" stroke-opacity="0.18" stroke-width="2"/>
    <rect x="58" y="58" width="1084" height="559" rx="28" fill="url(#card)" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.5"/>

    <text x="600" y="128" text-anchor="middle" fill="#ffd7eb" font-family="DejaVu Sans, sans-serif" font-size="24" letter-spacing="8">LOBSTER LOVE LAB</text>
    <text x="600" y="190" text-anchor="middle" fill="#fff7fb" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="700">Love Compatibility</text>
    <text x="600" y="230" text-anchor="middle" fill="#ffd0e5" font-family="DejaVu Sans, sans-serif" font-size="24">${mood}</text>

    <g filter="url(#softShadow)">
      <rect x="110" y="262" width="360" height="286" rx="30" fill="#ffffff" fill-opacity="0.08" stroke="#ffb7d8" stroke-opacity="0.28" stroke-width="2"/>
      <rect x="730" y="262" width="360" height="286" rx="30" fill="#ffffff" fill-opacity="0.08" stroke="#ffb7d8" stroke-opacity="0.28" stroke-width="2"/>
    </g>

    <circle cx="290" cy="330" r="112" fill="#ff8fbe" opacity="0.18"/>
    <circle cx="910" cy="330" r="112" fill="#ff8fbe" opacity="0.18"/>
    <circle cx="290" cy="330" r="106" fill="#ffdfee" opacity="0.18"/>
    <circle cx="910" cy="330" r="106" fill="#ffdfee" opacity="0.18"/>

    <image x="192" y="232" width="196" height="196" preserveAspectRatio="xMidYMid slice" clip-path="url(#leftClip)" href="data:image/png;base64,${leftAvatar}" xlink:href="data:image/png;base64,${leftAvatar}"/>
    <image x="812" y="232" width="196" height="196" preserveAspectRatio="xMidYMid slice" clip-path="url(#rightClip)" href="data:image/png;base64,${rightAvatar}" xlink:href="data:image/png;base64,${rightAvatar}"/>

    <circle cx="290" cy="330" r="101" fill="none" stroke="#fff1f8" stroke-width="6"/>
    <circle cx="910" cy="330" r="101" fill="none" stroke="#fff1f8" stroke-width="6"/>
    <circle cx="290" cy="330" r="112" fill="none" stroke="#ff9fc9" stroke-opacity="0.45" stroke-width="2"/>
    <circle cx="910" cy="330" r="112" fill="none" stroke="#ff9fc9" stroke-opacity="0.45" stroke-width="2"/>

    <text x="290" y="478" text-anchor="middle" fill="#fff4fa" font-family="DejaVu Sans, sans-serif" font-size="31" font-weight="700">${leftName}</text>
    <text x="910" y="478" text-anchor="middle" fill="#fff4fa" font-family="DejaVu Sans, sans-serif" font-size="31" font-weight="700">${rightName}</text>
    <text x="290" y="512" text-anchor="middle" fill="#ffd3e8" font-family="DejaVu Sans, sans-serif" font-size="18">sending love</text>
    <text x="910" y="512" text-anchor="middle" fill="#ffd3e8" font-family="DejaVu Sans, sans-serif" font-size="18">feeling the vibe</text>

    <path d="${heartPath(600, 292, 118)}" fill="url(#heartFill)" stroke="#fff0f7" stroke-width="5" filter="url(#softShadow)"/>
    <path d="${heartPath(548, 274, 18)}" fill="#fff7fc" opacity="0.55"/>
    <text x="600" y="356" text-anchor="middle" fill="#fffafc" font-family="DejaVu Sans, sans-serif" font-size="46" font-weight="700">${score}%</text>
    <text x="600" y="385" text-anchor="middle" fill="#ffeaf4" font-family="DejaVu Sans, sans-serif" font-size="18" letter-spacing="3">MATCH</text>

    <text x="600" y="470" text-anchor="middle" fill="#ffe3f1" font-family="DejaVu Sans, sans-serif" font-size="24">💕  💞  💗  💘  💝</text>

    <rect x="340" y="545" width="${barWidth}" height="28" rx="14" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.12"/>
    <rect x="340" y="545" width="${fillWidth}" height="28" rx="14" fill="url(#barFill)"/>
    <circle cx="${340 + Math.min(fillWidth, barWidth) - 14}" cy="559" r="18" fill="#fff5fb" opacity="0.95"/>
    <path d="${heartPath(340 + Math.min(fillWidth, barWidth) - 14, 550, 12)}" fill="#ff4f95"/>
    <text x="340" y="600" fill="#ffdceb" font-family="DejaVu Sans, sans-serif" font-size="18">0%</text>
    <text x="${340 + barWidth}" y="600" text-anchor="end" fill="#ffdceb" font-family="DejaVu Sans, sans-serif" font-size="18">100%</text>

    <text x="600" y="640" text-anchor="middle" fill="#fff0f8" font-family="DejaVu Sans, sans-serif" font-size="22">A sweet, just-for-fun love match ✨</text>
  </svg>`;
}

function renderPng(svg) {
  return new Promise((resolve, reject) => {
    const attempts = [
      {
        name: 'rsvg-convert',
        cmd: 'rsvg-convert',
        args: ['-f', 'png', '-w', String(WIDTH), '-h', String(HEIGHT)]
      },
      {
        name: 'magick',
        cmd: process.platform === 'win32' ? 'magick.exe' : 'magick',
        args: [
          '-background', 'none',
          'svg:-',
          '-strip',
          '-define', 'png:compression-level=8',
          'png:-'
        ]
      },
      {
        name: 'convert',
        cmd: 'convert',
        args: [
          '-background', 'none',
          'svg:-',
          '-strip',
          '-define', 'png:compression-level=8',
          'png:-'
        ]
      }
    ];

    let index = 0;
    let renderer;
    let settled = false;

    const finish = (error, image) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(image);
    };

    const tryNext = (previousError) => {
      if (settled) return;
      if (index >= attempts.length) {
        const detail = previousError?.message ? ` (${previousError.message})` : '';
        finish(new Error(`The ship card image renderer is not available on the bot host${detail}.`));
        return;
      }

      const attempt = attempts[index++];
      const chunks = [];
      let outputBytes = 0;
      let stderr = '';
      let killedForSize = false;

      renderer = spawn(attempt.cmd, attempt.args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const current = renderer;
      const timeout = setTimeout(() => {
        try { current.kill('SIGKILL'); } catch {}
      }, 20_000);

      current.stdout.on('data', chunk => {
        if (renderer !== current || settled) return;
        outputBytes += chunk.length;
        if (outputBytes > MAX_IMAGE_BYTES) {
          killedForSize = true;
          try { current.kill('SIGKILL'); } catch {}
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
        clearTimeout(timeout);
        if (renderer !== current || settled) return;
        if (error.code === 'ENOENT') {
          tryNext(error);
          return;
        }
        finish(error);
      });

      current.once('close', code => {
        clearTimeout(timeout);
        if (renderer !== current || settled) return;
        if (killedForSize) {
          finish(new Error('The ship card image is too large to render.'));
          return;
        }
        if (code !== 0 || !outputBytes) {
          finish(new Error(`Could not render ship card with ${attempt.name}${stderr ? `: ${stderr.trim()}` : '.'}`));
          return;
        }
        finish(null, Buffer.concat(chunks, outputBytes));
      });

      current.stdin.end(svg);
    };

    tryNext();
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
