/**
 * Profile card: avatar, name, badges, stats, progress bar.
 * @module canvas/cards/profileCard
 */

const { createCanvas } = require('@napi-rs/canvas');
const theme = require('../theme');
const { drawBase, cardBounds, drawAvatar, fitText, drawPanel, drawProgressBar, drawPill, formatNumber, font } = require('../helpers');

/**
 * @param {{ avatarUrl?: string, username: string, tag?: string, badges?: string[], level?: number, xp?: number, xpNeeded?: number, rank?: number|string, stats?: Array<{label:string,value:string}> }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  const w = theme.WIDTH;
  const h = theme.DEFAULT_HEIGHT;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  // avatar
  const avatarSize = 180 * theme.SCALE;
  await drawAvatar(ctx, data.avatarUrl, b.x, b.y, avatarSize, data.username || '?', theme.colors.accent);

  const infoX = b.x + avatarSize + 36 * theme.SCALE;
  const infoMaxW = b.right - infoX;

  // username
  const nameFit = fitText(ctx, data.username || 'User', infoMaxW, theme.sizes.title, theme.sizes.value, 'bold');
  ctx.font = nameFit.font;
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(nameFit.text, infoX, b.y);

  // tag
  if (data.tag) {
    ctx.font = font('regular', theme.sizes.subtitle);
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.fillText(fitText(ctx, data.tag, infoMaxW, theme.sizes.subtitle, theme.sizes.body, 'regular').text, infoX, b.y + theme.sizes.title + 6 * theme.SCALE);
  }

  // badges
  const badges = Array.isArray(data.badges) ? data.badges.slice(0, 5) : [];
  let bx = infoX;
  let by = b.y + 110 * theme.SCALE;
  for (const badge of badges) {
    const p = drawPill(ctx, bx, by, badge, { bg: 'rgba(255,90,79,0.15)', color: theme.colors.accent });
    bx += p.w + 10 * theme.SCALE;
    if (bx > b.right - 80 * theme.SCALE) break;
  }

  // progress panel
  const panelY = b.y + avatarSize + 36 * theme.SCALE;
  const panelH = 110 * theme.SCALE;
  drawPanel(ctx, b.x, panelY, b.w, panelH);

  const xp = Number(data.xp) || 0;
  const xpNeeded = Number(data.xpNeeded) || 100;
  const progress = xpNeeded > 0 ? xp / xpNeeded : 0;
  const level = data.level != null ? data.level : 0;
  const rank = data.rank != null ? data.rank : '—';

  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('semibold', theme.sizes.label);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('LEVEL', b.x + theme.spacing.panelPadding, panelY + 16 * theme.SCALE);
  ctx.fillText('RANK', b.x + 200 * theme.SCALE, panelY + 16 * theme.SCALE);
  ctx.textAlign = 'right';
  ctx.fillText('XP', b.right - theme.spacing.panelPadding, panelY + 16 * theme.SCALE);

  ctx.fillStyle = theme.colors.textPrimary;
  ctx.font = font('bold', theme.sizes.value);
  ctx.textAlign = 'left';
  ctx.fillText(String(level), b.x + theme.spacing.panelPadding, panelY + 16 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);
  ctx.fillText(`#${rank}`, b.x + 200 * theme.SCALE, panelY + 16 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatNumber(xp)} / ${formatNumber(xpNeeded)} (${Math.round(progress * 100)}%)`, b.right - theme.spacing.panelPadding, panelY + 16 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);

  const barY = panelY + panelH - 22 * theme.SCALE;
  const barX = b.x + theme.spacing.panelPadding;
  const barW = b.w - theme.spacing.panelPadding * 2;
  drawProgressBar(ctx, barX, barY, barW, 10 * theme.SCALE, progress, theme.colors.accent);

  // stats grid
  const stats = Array.isArray(data.stats) ? data.stats.slice(0, 6) : [];
  const cols = 3;
  const gap = theme.spacing.gap;
  const sY = panelY + panelH + gap;
  const sW = (b.w - gap * (cols - 1)) / cols;
  const sH = 90 * theme.SCALE;
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = b.x + col * (sW + gap);
    const y = sY + row * (sH + gap);
    drawPanel(ctx, x, y, sW, sH);
    ctx.fillStyle = theme.colors.textMuted;
    ctx.font = font('semibold', theme.sizes.label);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(s.label || '').toUpperCase().slice(0, 24), x + theme.spacing.panelPadding, y + 14 * theme.SCALE);
    ctx.fillStyle = theme.colors.textPrimary;
    const vFit = fitText(ctx, s.value ?? '—', sW - theme.spacing.panelPadding * 2, theme.sizes.value, theme.sizes.body, 'bold');
    ctx.font = vFit.font;
    ctx.fillText(vFit.text, x + theme.spacing.panelPadding, y + 14 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);
  });

  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('regular', theme.sizes.label);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Lobster', b.right, b.bottom);

  return canvas.toBuffer('image/png');
}

module.exports = { render };
