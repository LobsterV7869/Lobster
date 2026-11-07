const { EmbedBuilder } = require('discord.js');
const { zoom, zoomReaction } = require('./emojis');
const { t } = require('./wordgame-text');
const { normalizeWord, getRequiredLetter, validateWord } = require('./wordchain');
const { getDict } = require('./wordgame-dict');
const { getWordGameState, saveWordGameState, ensureLangState, getLang, getGameChannel } = require('./wordgame-store');

const locks = new Map(); // channelId+lang

async function withLock(key, fn) {
  const p = locks.get(key) || Promise.resolve();
  const next = p.then(fn).catch(err => { throw err; });
  locks.set(key, next.catch(() => {}));
  return next;
}

function getLockKey(guildId, channelId, lang) {
  return `${guildId}:${channelId}:${lang}`;
}

function makeUsageEmbed(guild) {
  const embed = new EmbedBuilder()
    .setColor(0x1F4E79)
    .setTitle(t('az', 'usage_title'))
    .setDescription(
      `${t('az', 'usage_rules_az')}\n${t('en', 'usage_rules_en')}\n\n${t('az', 'usage_cmds')} • ${t('en', 'usage_cmds')}\n${t('az', 'usage_lang')} • ${t('en', 'usage_lang')}`
    )
    .setFooter({ text: t('az', 'footer') });
  return embed;
}

function makeStartedEmbed(lang, firstWord) {
  const req = getRequiredLetter(firstWord, lang);
  const embed = new EmbedBuilder()
    .setColor(0x1F4E79)
    .setTitle(t(lang, 'game_started_title'))
    .setDescription(
      `${t(lang, 'game_started_desc')}\n\n**${t(lang, 'rules_en_field')}**\n${t(lang, 'rules_en')}\n\n**${t(lang, 'rules_az_field')}**\n${t(lang, 'rules_az')}`
    )
    .addFields(
      { name: t(lang, 'first_word'), value: `**${firstWord.toUpperCase()}**`, inline: true },
      { name: t(lang, 'next_letter'), value: req ? `**${String(req).toUpperCase()}**` : '**?**', inline: true }
    )
    .setFooter({ text: t(lang, 'footer') });
  return embed;
}

function makeGameOverEmbed(lang, stateLang) {
  const players = stateLang.players || {};
  const entries = Object.entries(players).map(([id, p]) => ({ id, score: p.score || 0 }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
  const topLines = entries.length ? entries.map((e,i) => `${i+1}. <@${e.id}> — **${e.score}**`).join('\n') : t(lang, 'no_data');
  const embed = new EmbedBuilder()
    .setColor(0x1F4E79)
    .setTitle(t(lang, 'game_over'))
    .addFields(
      { name: t(lang, 'total_words'), value: `**${stateLang.total || 0}**`, inline: true },
      { name: t(lang, 'longest_streak'), value: `**${stateLang.record || 0}**`, inline: true },
      { name: t(lang, 'top_players'), value: topLines }
    )
    .setFooter({ text: t(lang, 'footer') });
  return embed;
}

function makeStatsEmbed(lang, guildId, userId) {
  const state = getWordGameState(guildId);
  const s = ensureLangState(state, lang);
  const p = (s.players && s.players[userId]) ? s.players[userId] : { score: 0 };
  const embed = new EmbedBuilder()
    .setColor(0x1F4E79)
    .setTitle(t(lang, 'stats_title'))
    .addFields(
      { name: t(lang, 'your_stats'), value: `**${p.score || 0}**`, inline: true },
      { name: t(lang, 'server_record'), value: `**${s.record || 0}**`, inline: true },
      { name: t(lang, 'current_streak'), value: `**${s.streak || 0}**`, inline: true }
    )
    .setFooter({ text: t(lang, 'footer') });
  return embed;
}

function makeTopEmbed(lang, guildId) {
  const state = getWordGameState(guildId);
  const s = ensureLangState(state, lang);
  const entries = Object.entries(s.players || {}).map(([id,p]) => ({ id, score: p.score || 0 }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
  const topLines = entries.length ? entries.map((e,i) => `${i+1}. <@${e.id}> — **${e.score}**`).join('\n') : t(lang, 'no_data');
  const embed = new EmbedBuilder()
    .setColor(0x1F4E79)
    .setTitle(t(lang, 'top_players'))
    .setDescription(topLines)
    .setFooter({ text: t(lang, 'footer') });
  return embed;
}

async function startGame({ guild, channel, lang = 'az', userId }) {
  const state = getWordGameState(guild.id);
  const s = ensureLangState(state, lang);
  const dict = getDict(lang);
  if (!dict || dict.size === 0) {
    return { ok: false, reason: 'dict_missing' };
  }
  if (s.active) return { ok: false, reason: 'already' };
  // pick random word 4-7 letters
  const candidates = [];
  for (const w of dict) {
    if (w.length >= 4 && w.length <= 7) candidates.push(w);
    if (candidates.length > 5000) break;
  }
  const list = candidates.length > 0 ? candidates : Array.from(dict);
  const firstWord = list[Math.floor(Math.random() * list.length)];
  s.active = true;
  s.channelId = channel.id;
  s.lastWord = firstWord;
  s.lastPlayerId = userId || null;
  s.used = [firstWord];
  s.streak = 0;
  s.total = 0;
  saveWordGameState(guild.id, state);
  return { ok: true, firstWord, lang };
}

function stopGame({ guild, lang = 'az' }) {
  const state = getWordGameState(guild.id);
  const s = ensureLangState(state, lang);
  if (!s.active) return { ok: false, reason: 'none' };
  s.active = false;
  saveWordGameState(guild.id, state);
  return { ok: true, stateLang: s };
}

module.exports = { makeUsageEmbed, makeStartedEmbed, makeGameOverEmbed, makeStatsEmbed, makeTopEmbed, startGame, stopGame, withLock, getLockKey, ensureLangState, getWordGameState, getDict };
