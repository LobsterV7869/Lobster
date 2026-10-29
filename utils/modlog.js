const { logGuildEvent } = require('./logs');

// Writes a moderation entry through the shared logger so every category uses
// the same formatting, channel resolution and enable/disable rules.
async function logModeration(guild, title, description, color = 0x5BA6FB) {
  return logGuildEvent(guild, 'moderation', title, description, { color });
}

module.exports = { logModeration };
