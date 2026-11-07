/**
 * Result card: success / error / warning / info.
 * @module canvas/cards/resultCard
 */

const { createCanvas } = require('@napi-rs/canvas');
const theme = require('../theme');
const { drawBase, cardBounds, drawIcon, fitText, wrapText, drawPanel, roundRect, font } = require('../helpers');

/**
 * @param {{ type?: 'success'|'error'|'warning'|'info', title: string, description?: string, fields?: Array<{label:string,value:string}> }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  const w = theme.WIDTH;
  const h = theme.DEFAULT_HEIGHT;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  const type = ['success','error','warning','info'].includes(data.type) ? data.type : 'info';
  const colorMap = { success: theme.colors.success, error: theme.colors.error, warning: theme.colors.warning, info: theme.colors.info };
  const accent = colorMap[type];

  // accent bar on left of card content area
  ctx.save();
  roundRect(ctx, b.x, b.y, 10 * theme.SCALE, b.h, 6 * theme.SCALE);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  const iconSize = 120 * theme.SCALE;
  const iconX = b.x + 32 * theme.SCALE;
  const iconY = b.y + (b.h - iconSize) / 2 - 40 * theme.SCALE;
  // icon background
  ctx.save();
  roundRect(ctx, iconX - 12*theme.SCALE, iconY - 12*theme.SCALE, iconSize + 24*theme.SCALE, iconSize + 24*theme.SCALE, 24*theme.SCALE);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.restore();
  drawIcon(ctx, type, iconX, iconY, iconSize, accent);

  const textX = iconX + iconSize + 48 * theme.SCALE;
  const textMaxW = b.right - textX;

  // title
  const titleFit = fitText(ctx, data.title || 'Result', textMaxW, theme.sizes.title, theme.sizes.subtitle, 'bold');
  ctx.font = titleFit.font;
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(titleFit.text, textX, b.y + 40 * theme.SCALE);

  // description
  ctx.font = font('regular', theme.sizes.body);
  const desc = String(data.description || '').trim();
  const lines = wrapText(ctx, desc, textMaxW, 4);
  let y = b.y + 40 * theme.SCALE + theme.sizes.title + theme.spacing.gapSm;
  ctx.fillStyle = theme.colors.textSecondary;
  for (const line of lines) {
    ctx.fillText(line, textX, y);
    y += theme.sizes.body * 1.35;
  }

  // fields
  const fields = Array.isArray(data.fields) ? data.fields.slice(0, 4) : [];
  if (fields.length) {
    y += theme.spacing.gapSm;
    const cols = Math.min(2, fields.length);
    const gap = theme.spacing.gap;
    const fw = (textMaxW - gap * (cols - 1)) / cols;
    const fh = 90 * theme.SCALE;
    fields.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fx = textX + col * (fw + gap);
      const fy = y + row * (fh + gap);
      drawPanel(ctx, fx, fy, fw, fh);
      ctx.fillStyle = theme.colors.textMuted;
      ctx.font = font('semibold', theme.sizes.label);
      ctx.textBaseline = 'top';
      ctx.fillText(String(f.label || '').toUpperCase().slice(0, 40), fx + theme.spacing.panelPadding, fy + 16 * theme.SCALE);
      ctx.fillStyle = theme.colors.textPrimary;
      const vFit = fitText(ctx, f.value ?? '—', fw - theme.spacing.panelPadding * 2, theme.sizes.value, theme.sizes.body, 'bold');
      ctx.font = vFit.font;
      ctx.fillText(vFit.text, fx + theme.spacing.panelPadding, fy + 16 * theme.SCALE + theme.sizes.label + 10 * theme.SCALE);
    });
  }

  // footer branding subtle
  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('regular', theme.sizes.label);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Lobster', b.right, b.bottom);

  return canvas.toBuffer('image/png');
}

module.exports = { render };
