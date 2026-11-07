const db = require('./database');

function getLang(guildId, override) {
  if (override === 'az' || override === 'en') return override;
  const settings = db.getSettings(guildId);
  if (settings.wordGameLanguage === 'en') return 'en';
  if (settings.wordGameLanguage === 'az') return 'az';
  return 'az';
}

function getGameChannel(guildId) {
  const settings = db.getSettings(guildId);
  return settings.wordGameChannel || null;
}

function getWordGameState(guildId) {
  const settings = db.getSettings(guildId);
  return settings.wordChain || {
    az: { active: false, channelId: null, lastWord: null, lastPlayerId: null, used: [], streak: 0, record: 0, players: {}, total: 0 },
    en: { active: false, channelId: null, lastWord: null, lastPlayerId: null, used: [], streak: 0, record: 0, players: {}, total: 0 }
  };
}

function saveWordGameState(guildId, state) {
  db.updateSetting(guildId, 'wordChain', state);
  return state;
}

function ensureLangState(state, lang) {
  if (!state[lang]) {
    state[lang] = { active: false, channelId: null, lastWord: null, lastPlayerId: null, used: [], streak: 0, record: 0, players: {}, total: 0 };
  }
  if (!Array.isArray(state[lang].used)) state[lang].used = [];
  if (!state[lang].players || typeof state[lang].players !== 'object') state[lang].players = {};
  return state[lang];
}

module.exports = { getLang, getGameChannel, getWordGameState, saveWordGameState, ensureLangState };
