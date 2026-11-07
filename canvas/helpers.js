/**
 * Drawing and formatting helpers for canvas cards.
 * @module canvas/helpers
 */

const theme = require('./theme');
const { font } = require('./fonts');

let _loadImage = null;
function getLoadImage() {
  if (_loadImage) return _loadImage;
  try {
    const { loadImage } = require('@napi-rs/canvas');
    _loadImage = loadImage;
  } catch (e) {
    _loadImage = null;
  }
  return _loadImage;
}

// Simple in-memory image cache (5 min TTL)
const imageCache = new Map();
const IMAGE_CACHE_TTL = 5 * 60 * 1000;

function pruneImageCache() {
  const now = Date.now();
  for (const [k, v] of imageCache) {
    if (now - v.ts > IMAGE_CACHE_TTL) imageCache.delete(k);
  }
}

/**
 * Load an image with timeout and caching.
 * @param {string} url
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<Image|null>}
 */
async function loadImageSafe(url, timeoutMs = 5000) {
  if (!url) return null;
  const key = String(url);
  const cached = imageCache.get(key);
  if (cached && Date.now() - cached.ts < IMAGE_CACHE_TTL) return cached.img;
  const loader = getLoadImage();
  if (!loader) return null;
  pruneImageCache();
  try {
    const img = await Promise.race([
      loader(key),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    imageCache.set(key, { img, ts: Date.now() });
    return img;
  } catch (e) {
    imageCache.set(key, { img: null, ts: Date.now() });
    return null;
  }
}

/**
 * Draw a rounded rectangle path.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Truncate text to maxWidth with ellipsis.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function truncate(ctx, text, maxWidth) {
  let s = String(text ?? '');
  if (maxWidth <= 0) return '';
  if (ctx.measureText(s).width <= maxWidth) return s;
  const ell = '…';
  while (s.length > 0 && ctx.measureText(s + ell).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s ? s + ell : ell;
}

/**
 * Fit text to maxWidth by shrinking font size, then truncate.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} startSize
 * @param {number} [minSize]
 * @param {'bold'|'semibold'|'regular'} [weight='regular']
 * @returns {{ text: string, font: string, size: number }}
 */
function fitText(ctx, text, maxWidth, startSize, minSize = theme.sizes.min, weight = 'regular') {
  let size = startSize;
  let f = font(weight, size);
  ctx.font = f;
  const s = String(text ?? '');
  while (size > minSize && ctx.measureText(s).width > maxWidth) {
    size -= 2 * theme.SCALE;
    f = font(weight, size);
    ctx.font = f;
  }
  const out = truncate(ctx, s, maxWidth);
  return { text: out, font: f, size };
}

/**
 * Wrap text into lines.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} [maxLines]
 * @returns {string[]}
 */
function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

/**
 * Draw a pill/badge.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {{ bg?: string, color?: string, fontSize?: number, px?: number, py?: number }} [opts]
 * @returns {{ w: number, h: number }}
 */
function drawPill(ctx, x, y, text, opts = {}) {
  const { bg = theme.colors.surface, color = theme.colors.textPrimary, fontSize = theme.sizes.label, px = 14 * theme.SCALE, py = 8 * theme.SCALE } = opts;
  ctx.save();
  ctx.font = font('semibold', fontSize);
  const m = ctx.measureText(String(text ?? ''));
  const w = m.width + px * 2;
  const h = fontSize + py * 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = theme.colors.borderSubtle;
  ctx.lineWidth = theme.line.borderSubtle;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text ?? ''), x + px, y + h / 2);
  ctx.restore();
  return { w, h };
}

/**
 * Draw a status pill (filled with status color).
 */
function drawStatusPill(ctx, x, y, status, opts = {}) {
  const s = String(status || '').toUpperCase();
  let bg = theme.colors.info;
  if (s === 'ACTIVE' || s === 'SUCCESS' || s === 'ONLINE') bg = theme.colors.success;
  else if (s === 'ENDED' || s === 'ERROR' || s === 'OFFLINE') bg = theme.colors.error;
  else if (s === 'WARNING') bg = theme.colors.warning;
  return drawPill(ctx, x, y, s, { ...opts, bg, color: '#FFFFFF' });
}

/**
 * Draw circular avatar with fallback.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|null} url
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} [fallbackLetter]
 * @param {string} [fallbackColor]
 */
async function drawAvatar(ctx, url, x, y, size, fallbackLetter = '?', fallbackColor = theme.colors.accent) {
  const img = await loadImageSafe(url);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font('bold', size * 0.42);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(fallbackLetter || '?').charAt(0).toUpperCase(), x + size / 2, y + size / 2 + size * 0.02);
  }
  ctx.restore();
  // border
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = theme.colors.border;
  ctx.lineWidth = theme.line.border;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw progress bar.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} progress 0-1
 * @param {string} [color]
 */
function drawProgressBar(ctx, x, y, w, h, progress, color = theme.colors.accent) {
  const p = Math.max(0, Math.min(1, progress || 0));
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = theme.colors.surface;
  ctx.fill();
  if (p > 0) {
    roundRect(ctx, x, y, Math.max(h, w * p), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = theme.colors.borderSubtle;
  ctx.lineWidth = theme.line.borderSubtle;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw simple vector icons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} [color]
 */
function drawIcon(ctx, type, x, y, size, color = theme.colors.textPrimary) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.38;
  switch (type) {
    case 'check':
    case 'success':
      ctx.beginPath();
      ctx.moveTo(x + size * 0.22, cy);
      ctx.lineTo(x + size * 0.44, y + size * 0.72);
      ctx.lineTo(x + size * 0.78, y + size * 0.28);
      ctx.stroke();
      break;
    case 'cross':
    case 'error':
      ctx.beginPath();
      ctx.moveTo(x + size * 0.28, y + size * 0.28);
      ctx.lineTo(x + size * 0.72, y + size * 0.72);
      ctx.moveTo(x + size * 0.72, y + size * 0.28);
      ctx.lineTo(x + size * 0.28, y + size * 0.72);
      ctx.stroke();
      break;
    case 'warning':
      ctx.beginPath();
      ctx.moveTo(cx, y + size * 0.18);
      ctx.lineTo(x + size * 0.82, y + size * 0.78);
      ctx.lineTo(x + size * 0.18, y + size * 0.78);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + size * 0.64, size * 0.03, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, y + size * 0.4); ctx.lineTo(cx, y + size * 0.56); ctx.stroke();
      break;
    case 'info':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + size * 0.35, size * 0.03, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, y + size * 0.46); ctx.lineTo(cx, y + size * 0.72); ctx.stroke();
      break;
    case 'trophy':
      ctx.beginPath();
      ctx.moveTo(x + size*0.3, y + size*0.22); ctx.lineTo(x + size*0.7, y + size*0.22);
      ctx.lineTo(x + size*0.64, y + size*0.52); ctx.quadraticCurveTo(cx, y + size*0.62, x + size*0.36, y + size*0.52);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y + size*0.58); ctx.lineTo(cx, y + size*0.72);
      ctx.moveTo(x + size*0.38, y + size*0.76); ctx.lineTo(x + size*0.62, y + size*0.76); ctx.stroke();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(x + size*0.2, y + size*0.7); ctx.lineTo(x + size*0.8, y + size*0.7);
      ctx.lineTo(x + size*0.78, y + size*0.38); ctx.lineTo(x + size*0.62, y + size*0.52);
      ctx.lineTo(cx, y + size*0.28); ctx.lineTo(x + size*0.38, y + size*0.52);
      ctx.lineTo(x + size*0.22, y + size*0.38); ctx.closePath(); ctx.stroke();
      break;
    case 'user':
      ctx.beginPath(); ctx.arc(cx, y + size*0.36, r*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + size*0.95, r*0.9, Math.PI*1.15, Math.PI*1.85); ctx.stroke();
      break;
    case 'clock':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, y + size*0.32);
      ctx.moveTo(cx, cy); ctx.lineTo(x + size*0.62, cy); ctx.stroke();
      break;
    case 'server':
    default:
      roundRect(ctx, x + size*0.18, y + size*0.22, size*0.64, size*0.56, size*0.08);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + size*0.3, y + size*0.42); ctx.lineTo(x + size*0.5, y + size*0.42);
      ctx.moveTo(x + size*0.3, y + size*0.58); ctx.lineTo(x + size*0.45, y + size*0.58); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + size*0.68, y + size*0.5, size*0.04, 0, Math.PI*2); ctx.fill();
      break;
  }
  ctx.restore();
}

/**
 * Format number (1.2K, 3.4M).
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(num));
}

/**
 * Format duration in ms.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length || (s < 60)) parts.push(`${sec}s`);
  return parts.slice(0, 2).join(' ');
}

/**
 * Format date short.
 * @param {Date|number|string} date
 * @returns {string}
 */
function formatDate(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getUTCDate()).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${mon} ${year} · ${hh}:${mm}`;
  } catch (e) {
    return '—';
  }
}

/**
 * Draw base card background.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawBase(ctx, w, h) {
  // background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, theme.colors.bgTop);
  grad.addColorStop(1, theme.colors.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // faint accent glow behind card area
  const glow = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, w * 0.5);
  glow.addColorStop(0, theme.colors.accentGlow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // card
  const p = theme.spacing.outer * 0.45; // outer margin
  roundRect(ctx, p, p, w - p * 2, h - p * 2, theme.radius.card);
  ctx.fillStyle = 'rgba(11,18,32,0.55)';
  ctx.fill();
  ctx.strokeStyle = theme.colors.border;
  ctx.lineWidth = theme.line.border;
  ctx.stroke();
}

/**
 * Get card content bounds.
 * @param {number} w
 * @param {number} h
 * @returns {{ x: number, y: number, w: number, h: number, right: number, bottom: number }}
 */
function cardBounds(w, h) {
  const margin = theme.spacing.outer * 0.45;
  const pad = theme.spacing.outer;
  const x = margin + pad;
  const y = margin + pad;
  const cw = w - (margin + pad) * 2;
  const ch = h - (margin + pad) * 2;
  return { x, y, w: cw, h: ch, right: x + cw, bottom: y + ch };
}

/**
 * Draw a surface panel.
 */
function drawPanel(ctx, x, y, w, h) {
  roundRect(ctx, x, y, w, h, theme.radius.panel);
  ctx.fillStyle = theme.colors.surface;
  ctx.fill();
  ctx.strokeStyle = theme.colors.borderSubtle;
  ctx.lineWidth = theme.line.borderSubtle;
  ctx.stroke();
}

module.exports = {
  loadImageSafe,
  roundRect,
  truncate,
  fitText,
  wrapText,
  drawPill,
  drawStatusPill,
  drawAvatar,
  drawProgressBar,
  drawIcon,
  formatNumber,
  formatDuration,
  formatDate,
  drawBase,
  cardBounds,
  drawPanel,
  font,
};
