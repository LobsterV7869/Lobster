/**
 * Event card: giveaways, polls, events.
 * @module canvas/cards/eventCard
 */

const { createCanvas } = require('@napi-rs/canvas');
const theme = require('../theme');
const { drawBase, cardBounds, drawIcon, fitText, drawPanel, drawStatusPill, formatDate, font } = require('../helpers');

/**
 * @param {{ title: string, status?: 'ACTIVE'|'ENDED', hostName?: string, id?: string, startedAt?: any, endedAt?: any, durationText?: string, winners?: string[], entries?: number, serverName?: string }} data
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
  drawIcon(ctx, 'trophy', b.x, b.y, 56 * theme.SCALE, theme.colors.accent);
  const titleMax = b.w - 280 * theme.SCALE;
  const titleFit = fitText(ctx, data.title || 'Event', titleMax, theme.sizes.title, theme.sizes.value, 'bold');
  ctx.font = titleFit.font;
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(titleFit.text, b.x + 72 * theme.SCALE, b.y);

  // status pill (right aligned)
  ctx.font = font('semibold', theme.sizes.label);
  const status = data.status || 'ACTIVE';
  // measure to place right
  const sp = drawStatusPill(ctx, 0, 0, status); // draw offscreen? easier measure
  // redraw properly
  ctx.clearRect(0,0,0,0); // no-op
  // just place at right
  const statusX = b.right - 140 * theme.SCALE;
  drawStatusPill(ctx, statusX, b.y + 8 * theme.SCALE, status);

  // timeline (3 columns)
  const tY = b.y + 110 * theme.SCALE;
  const tH = 90 * theme.SCALE;
  const cols = 3;
  const gap = theme.spacing.gap;
  const tW = (b.w - gap * (cols - 1)) / cols;
  const timeline = [
    { label: 'STARTED', value: data.startedAt ? formatDate(data.startedAt) : '—' },
    { label: 'ENDED', value: data.endedAt ? formatDate(data.endedAt) : '—' },
    { label: 'DURATION', value: data.durationText || '—' },
  ];
  timeline.forEach((t, i) => {
    const x = b.x + i * (tW + gap);
    drawPanel(ctx, x, tY, tW, tH);
    ctx.fillStyle = theme.colors.textMuted;
    ctx.font = font('semibold', theme.sizes.label);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t.label, x + theme.spacing.panelPadding, tY + 14 * theme.SCALE);
    ctx.fillStyle = theme.colors.textPrimary;
    const vFit = fitText(ctx, t.value, tW - theme.spacing.panelPadding * 2, theme.sizes.body, theme.sizes.label, 'semibold');
    ctx.font = vFit.font;
    ctx.fillText(vFit.text, x + theme.spacing.panelPadding, tY + 14 * theme.SCALE + theme.sizes.label + 8 * theme.SCALE);
  });

  // winners panel
  const wY = tY + tH + gap;
  const wH = 120 * theme.SCALE;
  drawPanel(ctx, b.x, wY, b.w, wH);
  ctx.fillStyle = theme.colors.textMuted;
  ctx.font = font('semibold', theme.sizes.label);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('WINNERS', b.x + theme.spacing.panelPadding, wY + 14 * theme.SCALE);
  const winners = Array.isArray(data.winners) ? data.winners : [];
  const winnersText = winners.length ? winners.slice(0, 5).join(', ') : 'No winners yet';
  ctx.fillStyle = winners.length ? theme.colors.gold : theme.colors.textSecondary;
  const winFit = fitText(ctx, winnersText, b.w - theme.spacing.panelPadding * 2, theme.sizes.value, theme.sizes.body, 'bold');
  ctx.font = winFit.font;
  ctx.fillText(winFit.text, b.x + theme.spacing.panelPadding, wY + 14 * theme.SCALE + theme.sizes.label + 10 * theme.SCALE);

  // stat boxes (4)
  const sY = wY + wH + gap;
  const sCols = 4;
  const sW = (b.w - gap * (sCols - 1)) / sCols;
  const sH = 80 * theme.SCALE;
  const stats = [
    { label: 'ENTRIES', value: String(data.entries ?? 0) },
    { label: 'HOST', value: data.hostName || '—' },
    { label: 'ID', value: data.id ? String(data.id).slice(-8) : '—' },
    { label: 'SERVER', value: data.serverName || '—' },
  ];
  stats.forEach((s, i) => {
    const x = b.x + i * (sW + gap);
    drawPanel(ctx, x, sY, sW, sH);
    ctx.fillStyle = theme.colors.textMuted;
    ctx.font = font('semibold', theme.sizes.label);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(s.label, x + theme.spacing.panelPadding, sY + 12 * theme.SCALE);
    ctx.fillStyle = theme.colors.textPrimary;
    const vFit = fitText(ctx, s.value, sW - theme.spacing.panelPadding * 2, theme.sizes.body, theme.sizes.label, 'semibold');
    ctx.font = vFit.font;
    ctx.fillText(vFit.text, x + theme.spacing.panelPadding, sY + 12 * theme.SCALE + theme.sizes.label + 6 * theme.SCALE);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { render };
