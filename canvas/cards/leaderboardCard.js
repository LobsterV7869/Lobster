/**
 * Leaderboard card: top ranked list.
 * @module canvas/cards/leaderboardCard
 */

let _canvas = null;
function getCanvas() {
  if (_canvas) return _canvas;
  try { _canvas = require('@napi-rs/canvas'); } catch (e) { _canvas = null; }
  return _canvas;
}
const theme = require('../theme');
const { drawBase, cardBounds, drawAvatar, fitText, drawPanel, drawIcon, formatNumber, font } = require('../helpers');

/**
 * @param {{ title: string, entries?: Array<{rank:number, avatarUrl?:string, name:string, value:string|number, userId?:string}>, highlightUserId?: string, page?: number, totalPages?: number }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  if (!getCanvas()) throw new Error('@napi-rs/canvas is not installed');
  const entries = Array.isArray(data.entries) ? data.entries.slice(0, 10) : [];
  const rowH = 78 * theme.SCALE;
  const headerH = 130 * theme.SCALE;
  const footerH = 50 * theme.SCALE;
  const margin = theme.spacing.outer * 0.45;
  const pad = theme.spacing.outer;
  const contentH = headerH + entries.length * (rowH + 10 * theme.SCALE) + footerH + pad;
  const h = Math.min(theme.MAX_HEIGHT, Math.max(theme.DEFAULT_HEIGHT, contentH + margin * 2));
  const w = theme.WIDTH;
  const canvas = getCanvas().createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  // header
  drawIcon(ctx, 'trophy', b.x, b.y, 56 * theme.SCALE, theme.colors.accent);
  const titleFit = fitText(ctx, data.title || 'Leaderboard', b.w - 80 * theme.SCALE, theme.sizes.title, theme.sizes.value, 'bold');
  ctx.font = titleFit.font;
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(titleFit.text, b.x + 72 * theme.SCALE, b.y);

  if (data.page || data.totalPages) {
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.font = font('regular', theme.sizes.body);
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${data.page || 1}/${data.totalPages || 1}`, b.right, b.y + 16 * theme.SCALE);
  }

  // rows
  let y = b.y + headerH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rank = e.rank != null ? e.rank : i + 1;
    const isHighlight = data.highlightUserId && e.userId && String(e.userId) === String(data.highlightUserId);
    const isTop1 = rank === 1, isTop2 = rank === 2, isTop3 = rank === 3;

    // row background
    drawPanel(ctx, b.x, y, b.w, rowH);
    if (isHighlight) {
      ctx.save();
      const { roundRect } = require('../helpers');
      roundRect(ctx, b.x, y, b.w, rowH, theme.radius.panel);
      ctx.strokeStyle = theme.colors.accent;
      ctx.lineWidth = 2 * theme.SCALE;
      ctx.stroke();
      ctx.restore();
    }

    // rank
    let rankColor = theme.colors.textSecondary;
    if (isTop1) rankColor = theme.colors.gold;
    else if (isTop2) rankColor = theme.colors.silver;
    else if (isTop3) rankColor = theme.colors.bronze;
    ctx.fillStyle = rankColor;
    ctx.font = font('bold', theme.sizes.value);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${rank}`, b.x + 44 * theme.SCALE, y + rowH / 2);

    // avatar
    const avSize = 48 * theme.SCALE;
    const avX = b.x + 90 * theme.SCALE;
    const avY = y + (rowH - avSize) / 2;
    await drawAvatar(ctx, e.avatarUrl, avX, avY, avSize, e.name || '?', isTop1 ? theme.colors.gold : theme.colors.accent);

    // name
    const nameX = avX + avSize + 18 * theme.SCALE;
    const valueText = typeof e.value === 'number' ? formatNumber(e.value) : String(e.value ?? '');
    ctx.font = font('bold', theme.sizes.value);
    const valueW = ctx.measureText(valueText).width + 20 * theme.SCALE;
    const nameMax = b.right - nameX - valueW - theme.spacing.panelPadding;
    ctx.fillStyle = isHighlight ? theme.colors.accent : theme.colors.textPrimary;
    ctx.font = font('semibold', theme.sizes.body + 2 * theme.SCALE);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nFit = fitText(ctx, e.name || 'Unknown', Math.max(100*theme.SCALE, nameMax), theme.sizes.body + 2 * theme.SCALE, theme.sizes.label, 'semibold');
    ctx.font = nFit.font;
    ctx.fillText(nFit.text, nameX, y + rowH / 2);

    // value (right aligned)
    ctx.fillStyle = theme.colors.textPrimary;
    ctx.font = font('bold', theme.sizes.body + 2 * theme.SCALE);
    ctx.textAlign = 'right';
    ctx.fillText(valueText, b.right - theme.spacing.panelPadding, y + rowH / 2);

    y += rowH + 10 * theme.SCALE;
  }

  if (!entries.length) {
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.font = font('regular', theme.sizes.body);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No entries yet.', b.x + b.w / 2, b.y + b.h / 2);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { render };
