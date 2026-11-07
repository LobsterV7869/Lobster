/**
 * Info card: title + key/value stats grid.
 * @module canvas/cards/infoCard
 */

const { createCanvas } = require('@napi-rs/canvas');
const theme = require('../theme');
const { drawBase, cardBounds, drawIcon, fitText, drawPanel, font } = require('../helpers');

/**
 * @param {{ title: string, subtitle?: string, iconType?: string, stats?: Array<{label:string,value:string}>, footer?: string }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  const w = theme.WIDTH;
  const h = theme.DEFAULT_HEIGHT;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  // header
  const iconSize = 64 * theme.SCALE;
  drawIcon(ctx, data.iconType || 'server', b.x, b.y, iconSize, theme.colors.accent);
  const titleX = b.x + iconSize + 20 * theme.SCALE;
  const titleMaxW = b.right - titleX;

  const titleFit = fitText(ctx, data.title || 'Info', titleMaxW, theme.sizes.title, theme.sizes.value, 'bold');
  ctx.font = titleFit.font;
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(titleFit.text, titleX, b.y);

  if (data.subtitle) {
    ctx.font = font('regular', theme.sizes.subtitle);
    ctx.fillStyle = theme.colors.textSecondary;
    const subFit = fitText(ctx, data.subtitle, titleMaxW, theme.sizes.subtitle, theme.sizes.body, 'regular');
    ctx.font = subFit.font;
    ctx.fillText(subFit.text, titleX, b.y + theme.sizes.title + 8 * theme.SCALE);
  }

  // stats grid
  const stats = Array.isArray(data.stats) ? data.stats.slice(0, 8) : [];
  const cols = stats.length > 4 ? 4 : 2;
  const rows = Math.ceil(stats.length / cols) || 1;
  const gridTop = b.y + 140 * theme.SCALE;
  const gap = theme.spacing.gap;
  const cellW = (b.w - gap * (cols - 1)) / cols;
  const cellH = 100 * theme.SCALE;

  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = b.x + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);
    drawPanel(ctx, x, y, cellW, cellH);
    // label
    ctx.fillStyle = theme.colors.textMuted;
    ctx.font = font('semibold', theme.sizes.label);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const label = String(s.label || '').toUpperCase();
    ctx.fillText(label.slice(0, 32), x + theme.spacing.panelPadding, y + 16 * theme.SCALE);
    // value
    ctx.fillStyle = theme.colors.textPrimary;
    const vMax = cellW - theme.spacing.panelPadding * 2;
    const vFit = fitText(ctx, s.value ?? '—', vMax, theme.sizes.value, theme.sizes.body, 'bold');
    ctx.font = vFit.font;
    ctx.fillText(vFit.text, x + theme.spacing.panelPadding, y + 16 * theme.SCALE + theme.sizes.label + 10 * theme.SCALE);
  });

  if (data.footer) {
    ctx.fillStyle = theme.colors.textMuted;
    ctx.font = font('regular', theme.sizes.label);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const fFit = fitText(ctx, data.footer, b.w, theme.sizes.label, theme.sizes.label, 'regular');
    ctx.font = fFit.font;
    ctx.fillText(fFit.text, b.x, b.bottom);
  }

  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('regular', theme.sizes.label);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Your server. Your rules.', b.right, b.bottom);

  return canvas.toBuffer('image/png');
}

module.exports = { render };
