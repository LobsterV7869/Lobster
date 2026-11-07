const AZ_LOWER = s => String(s || '').toLocaleLowerCase('az');
const EN_LOWER = s => String(s || '').toLowerCase();

const AZ_ALPHABET = ['a','b','c','ç','d','e','ə','f','g','ğ','h','x','ı','i','j','k','q','l','m','n','o','ö','p','r','s','ş','t','u','ü','v','y','z'];
const EN_ALPHABET = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];

function normalizeWord(word, lang = 'az') {
  if (!word) return '';
  if (lang === 'az') return AZ_LOWER(word).trim();
  return EN_LOWER(word).trim();
}

function isLettersOnly(word, lang = 'az') {
  if (lang === 'az') {
    // allow az letters
    return /^[a-zçəğışöü]{2,}$/.test(word);
  }
  return /^[a-z]{2,}$/.test(word);
}

function lastLetter(word, lang = 'az') {
  const w = normalizeWord(word, lang);
  if (!w) return null;
  // for ğ in az, use previous letter as required? spec says "for a word ending in \"ğ\" use the previous letter as the required letter"
  if (lang === 'az') {
    if (w.endsWith('ğ') && w.length >= 2) {
      return w[w.length - 2];
    }
    return w[w.length - 1];
  }
  // english: use last a-z letter
  const m = w.match(/[a-z]/g);
  if (!m || m.length === 0) return null;
  return m[m.length - 1];
}

function firstLetter(word, lang = 'az') {
  const w = normalizeWord(word, lang);
  if (!w) return null;
  return w[0];
}

function getRequiredLetter(prevWord, lang = 'az') {
  if (!prevWord) return null;
  return lastLetter(prevWord, lang);
}

function validateWord({ word, lang = 'az', dictSet, usedSet, lastWord, lastPlayerId, playerId }) {
  if (!dictSet || !usedSet) return { ok: false, reason: 'dict_missing' };
  const nw = normalizeWord(word, lang);
  if (!nw) return { ok: false, reason: 'invalid' };
  if (lang === 'az') {
    if (!/^[a-zçəğışöü]+$/.test(nw)) return { ok: false, reason: 'invalid' };
  } else {
    if (!/^[a-z]+$/.test(nw)) return { ok: false, reason: 'invalid' };
  }
  if (nw.length < 2) return { ok: false, reason: 'short' };
  if (lastPlayerId && playerId && lastPlayerId === playerId) return { ok: false, reason: 'same_player' };
  if (usedSet.has(nw)) return { ok: false, reason: 'used' };
  if (!dictSet.has(nw)) return { ok: false, reason: 'not_found' };
  if (lastWord) {
    const req = getRequiredLetter(lastWord, lang);
    const fl = firstLetter(nw, lang);
    if (req && fl && req !== fl) return { ok: false, reason: 'wrong_letter', required: req };
  }
  return { ok: true, word: nw };
}

module.exports = { normalizeWord, isLettersOnly, lastLetter, firstLetter, getRequiredLetter, validateWord, AZ_LOWER, EN_LOWER };
