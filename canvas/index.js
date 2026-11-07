/**
 * Canvas card renderer.
 * @module canvas
 */

const { registerFonts } = require('./fonts');

// register fonts once on load (safe)
try { registerFonts(); } catch (e) { console.error('[canvas] font registration failed:', e.message); }

const cards = {
  info: require('./cards/infoCard'),
  profile: require('./cards/profileCard'),
  leaderboard: require('./cards/leaderboardCard'),
  result: require('./cards/resultCard'),
  list: require('./cards/listCard'),
  event: require('./cards/eventCard'),
  welcome: require('./cards/welcomeCard'),
};

/**
 * Render a card to PNG buffer.
 * @param {string} type
 * @param {object} data
 * @returns {Promise<Buffer>}
 */
async function renderCard(type, data = {}) {
  const card = cards[type];
  if (!card || typeof card.render !== 'function') {
    throw new Error(`Unknown canvas card type: ${type}`);
  }
  return card.render(data);
}

/**
 * Register a new card type.
 * @param {string} type
 * @param {{ render: (data: object) => Promise<Buffer> }} cardModule
 */
function registerCard(type, cardModule) {
  if (!type || !cardModule?.render) throw new Error('Invalid card registration');
  cards[type] = cardModule;
}

module.exports = { renderCard, registerCard, cards };
