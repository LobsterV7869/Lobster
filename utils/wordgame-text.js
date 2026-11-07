const texts = {
  az: {
    usage_title: 'Word Chain',
    usage_rules_en: 'English: Send one word per message starting with the last letter of the previous word. Use valid dictionary words, no repeats, not twice in a row.',
    usage_rules_az: 'Azərbaycanca: Hər mesajda yalnız bir söz göndərin. Söz əvvəlki sözün son hərfi ilə başlamalıdır. Lüğətdə olan, daha əvvəl işlənməyən sözlərdən istifadə edin, ardıcıl iki dəfə yazmaq olmaz.',
    usage_cmds: 'Commands: start, stop, stats, top',
    usage_lang: 'Languages: az (default), en',
    game_started_title: 'Word Chain',
    game_started_desc: 'Game started. Follow the rules below.',
    rules_en_field: 'Rules (EN)',
    rules_az_field: 'Qaydalar (AZ)',
    rules_en: 'Send one word starting with the last letter of the previous word. One word per message. Must exist in dictionary, not used, not same player twice in a row.',
    rules_az: 'Bir söz göndərin. Söz əvvəlki sözün son hərfi ilə başlamalıdır. Hər mesajda yalnız bir söz. Lüğətdə olmalı, əvvəl işlənməməli, ardıcıl iki dəfə yazmamaq lazımdır.',
    first_word: 'First word',
    next_letter: 'Next letter',
    footer: 'Your server. Your rules.',
    wrong_letter: (req) => `❌ Söz **${String(req).toUpperCase()}** hərfi ilə başlamalıdır!`,
    not_found: '❌ Bu söz lüğətdə tapılmadı.',
    used: '❌ Bu söz artıq işlənib.',
    same_player: '❌ Ardıcıl iki dəfə yazmaq olmaz.',
    invalid: '❌ Yalnız hərflərdən ibarət bir söz göndərin.',
    short: '❌ Söz ən azı 2 hərfdən ibarət olmalıdır.',
    dict_missing: '❌ Lüğət mövcud deyil. Oyunu başlamaq mümkün deyil.',
    game_already: '❌ Bu kanalda artıq oyun aktivdir.',
    game_none: '❌ Bu kanalda aktiv oyun yoxdur.',
    game_stopped: '🛑 Oyun dayandırıldı.',
    need_channel: '❌ Game channel must be set via dashboard or use in game channel.',
    started_in: (ch) => `Oyun başladıldı: ${ch}`,
    game_over: 'Game Over',
    total_words: 'Total words',
    longest_streak: 'Longest streak',
    top_players: 'Top players',
    stats_title: 'Word Chain Stats',
    your_stats: 'Your stats',
    server_record: 'Server record',
    current_streak: 'Current streak',
    no_data: 'No data yet.'
  },
  en: {
    usage_title: 'Word Chain',
    usage_rules_en: 'English: Send one word per message starting with the last letter of the previous word. Use valid dictionary words, no repeats, not twice in a row.',
    usage_rules_az: 'Azerbaijani: Send one word per message. The word must start with the last letter of the previous word. Use dictionary words, no repeats, you cannot play twice in a row.',
    usage_cmds: 'Commands: start, stop, stats, top',
    usage_lang: 'Languages: az (default), en',
    game_started_title: 'Word Chain',
    game_started_desc: 'Game started. Follow the rules below.',
    rules_en_field: 'Rules (EN)',
    rules_az_field: 'Rules (AZ)',
    rules_en: 'Send one word starting with the last letter of the previous word. One word per message. Must exist in dictionary, not used, not same player twice in a row.',
    rules_az: 'Send one word starting with the last letter of the previous word. One word per message. Must be in the dictionary, not used already, cannot play twice in a row.',
    first_word: 'First word',
    next_letter: 'Next letter',
    footer: 'Your server. Your rules.',
    wrong_letter: (req) => `❌ The word must start with **${String(req).toUpperCase()}**!`,
    not_found: '❌ That word is not in the dictionary.',
    used: '❌ That word was already used.',
    same_player: "❌ You can't play twice in a row.",
    invalid: '❌ Send only a single word with letters only.',
    short: '❌ The word must be at least 2 letters long.',
    dict_missing: '❌ Dictionary is not available. Cannot start the game.',
    game_already: '❌ A game is already active in this channel.',
    game_none: '❌ No active game in this channel.',
    game_stopped: '🛑 Game stopped.',
    need_channel: '❌ Game channel must be set via dashboard or use in game channel.',
    started_in: (ch) => `Game started in ${ch}`,
    game_over: 'Game Over',
    total_words: 'Total words',
    longest_streak: 'Longest streak',
    top_players: 'Top players',
    stats_title: 'Word Chain Stats',
    your_stats: 'Your stats',
    server_record: 'Server record',
    current_streak: 'Current streak',
    no_data: 'No data yet.'
  }
};

function t(lang, key, ...args) {
  const l = lang === 'en' ? 'en' : 'az';
  const fn = texts[l][key];
  if (typeof fn === 'function') return fn(...args);
  if (fn !== undefined) return fn;
  // fallback to az
  const f2 = texts.az[key];
  if (typeof f2 === 'function') return f2(...args);
  return f2 !== undefined ? f2 : key;
}

function getTexts(lang) {
  const l = lang === 'en' ? 'en' : 'az';
  return texts[l];
}

module.exports = { t, getTexts, texts };
