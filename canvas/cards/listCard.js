/**
 * List card: paginated list of items.
 * @module canvas/cards/listCard
 */

const { createCanvas } = require('@napi-rs/canvas');
const theme = require('../theme');
const { drawBase, cardBounds, drawIcon, fitText, drawPanel, font } = require('../helpers');

/**
 * @param {{ title: string, items?: Array<{name:string, description?:string}>, page?: number, totalPages?: number, iconType?: string }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  const items = Array.isArray(data.items) ? data.items.slice(0, 12) : [];
  const rowH = 64 * theme.SCALE;
  const headerH = 120 * theme.SCALE;
  const margin = theme.spacing.outer * 0.45;
  const pad = theme.spacing.outer;
  const contentH = headerH + items.length * (rowH + 8 * theme.SCALE) + pad;
  const h = Math.min(theme.MAX_HEIGHT, Math.max(theme.DEFAULT_HEIGHT, contentH + margin * 2));
  const w = theme.WIDTH;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  drawIcon(ctx, data.iconType || 'info', b.x, b.y, 56 * theme.SCALE, theme.colors.accent);
  const titleFit = fitText(ctx, data.title || 'List', b.w - 80 * theme.SCALE, theme.sizes.title, theme.sizes.value, 'bold');
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

  let y = b.y + headerH;
  items.forEach((item, i) => {
    drawPanel(ctx, b.x, y, b.w, rowH);
    // index badge
    const badgeX = b.x + theme.spacing.panelPadding;
    const badgeY = y + (rowH - 34 * theme.SCALE) / 2;
    const { roundRect } = require('../helpers');
    ctx.save();
    roundRect(ctx, badgeX, badgeY, 34 * theme.SCALE, 34 * theme.SCALE, 10 * theme.SCALE);
    ctx.fillStyle = 'rgba(255,90,79,0.15)';
    ctx.fill();
    ctx.fillStyle = theme.colors.accent;
    ctx.font = font('semibold', theme.sizes.label);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), badgeX + 17 * theme.SCALE, badgeY + 17 * theme.SCALE);
    ctx.restore();

    const textX = badgeX + 46 * theme.SCALE;
    const textMax = b.right - textX - theme.spacing.panelPadding;
    ctx.fillStyle = theme.colors.textPrimary;
    ctx.font = font('semibold', theme.sizes.body);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nFit = fitText(ctx, item.name || 'Item', textMax, theme.sizes.body, theme.sizes.label, 'semibold');
    ctx.font = nFit.font;
    // if description, shift up
    const hasDesc = item.description;
    ctx.fillText(nFit.text, textX, hasDesc ? y + rowH * 0.38 : y + rowH / 2);
    if (hasDesc) {
      ctx.fillStyle = theme.colors.textSecondary;
      ctx.font = font('regular', theme.sizes.label + 2 * theme.SCALE);
      const dFit = fitText(ctx, item.description, textMax, theme.sizes.label + 2 * theme.SCALE, theme.sizes.label, 'regular');
      ctx.font = dFit.font;
      ctx.fillText(dFit.text, textX, y + rowH * 0.68);
    }
    y += rowH + 8 * theme.SCALE;
  });

  if (!items.length) {
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.font = font('regular', theme.sizes.body);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No items.', b.x + b.w / 2, b.y + b.h / 2);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { render };
