/**
 * Welcome card: big avatar + welcome message + member count.
 * @module canvas/cards/welcomeCard
 */

let _canvas = null;
function getCanvas() {
  if (_canvas) return _canvas;
  try { _canvas = require('@napi-rs/canvas'); } catch (e) { _canvas = null; }
  return _canvas;
}
const theme = require('../theme');
const { drawBase, cardBounds, drawAvatar, fitText, drawPanel, formatNumber, font } = require('../helpers');

/**
 * @param {{ avatarUrl?: string, username: string, serverName: string, memberCount?: number, type?: 'join'|'leave' }} data
 * @returns {Promise<Buffer>}
 */
async function render(data = {}) {
  if (!getCanvas()) throw new Error('@napi-rs/canvas is not installed');
  const w = theme.WIDTH;
  const h = theme.DEFAULT_HEIGHT;
  const canvas = getCanvas().createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  drawBase(ctx, w, h);
  const b = cardBounds(w, h);

  const isLeave = data.type === 'leave';
  const accent = isLeave ? theme.colors.error : theme.colors.success;

  // avatar centered
  const avatarSize = 200 * theme.SCALE;
  const ax = b.x + (b.w - avatarSize) / 2;
  const ay = b.y + 40 * theme.SCALE;
  await drawAvatar(ctx, data.avatarUrl, ax, ay, avatarSize, data.username || '?', accent);

  // title
  const title = isLeave ? 'Goodbye' : 'Welcome';
  ctx.font = font('bold', theme.sizes.title);
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, b.x + b.w / 2, ay + avatarSize + 30 * theme.SCALE);

  // username
  const nameFit = fitText(ctx, data.username || 'Member', b.w - 80 * theme.SCALE, theme.sizes.subtitle + 6*theme.SCALE, theme.sizes.body, 'semibold');
  ctx.font = nameFit.font;
  ctx.fillStyle = accent;
  ctx.fillText(nameFit.text, b.x + b.w / 2, ay + avatarSize + 30 * theme.SCALE + theme.sizes.title + 10 * theme.SCALE);

  // server panel
  const panelY = ay + avatarSize + 170 * theme.SCALE;
  drawPanel(ctx, b.x + b.w * 0.2, panelY, b.w * 0.6, 90 * theme.SCALE);
  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('semibold', theme.sizes.label);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(isLeave ? 'LEFT SERVER' : 'JOINED SERVER', b.x + b.w / 2, panelY + 14 * theme.SCALE);
  ctx.fillStyle = theme.colors.textPrimary;
  const sFit = fitText(ctx, data.serverName || 'Server', b.w * 0.55, theme.sizes.value, theme.sizes.body, 'bold');
  ctx.font = sFit.font;
  ctx.fillText(sFit.text, b.x + b.w / 2, panelY + 14 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);

  // member count
  if (data.memberCount != null) {
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.font = font('regular', theme.sizes.body);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Member #${formatNumber(data.memberCount)}`, b.x + b.w / 2, b.bottom);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { render };
