const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
};

// Accepts "10m", "2h", "7d", "1w" or a bare number of minutes.
function parseDuration(input) {
  if (input === null || input === undefined) return null;
  const value = String(input).trim().toLowerCase();
  if (!value) return null;
  const match = /^(\d+)\s*([smhdw])?$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2] || 'm';
  return amount * UNIT_MS[unit];
}

function formatDuration(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
}

module.exports = { parseDuration, formatDuration };
