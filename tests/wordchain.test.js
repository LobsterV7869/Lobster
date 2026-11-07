const test = require('node:test');
const assert = require('node:assert');
const { normalizeWord, lastLetter, validateWord } = require('../utils/wordchain');

test('az normalization and i/I', () => {
  assert.strictEqual(normalizeWord('İstanbul', 'az'), 'istanbul');
  // Iğdır with capital I
  assert.strictEqual(normalizeWord('Iğdır', 'az'), 'ığdır');
});

test('az letters', () => {
  assert.strictEqual(normalizeWord('Əli', 'az'), 'əli');
  assert.strictEqual(normalizeWord('Göz', 'az'), 'göz');
  assert.strictEqual(normalizeWord('Çay', 'az'), 'çay');
  assert.strictEqual(normalizeWord('Şəhər', 'az'), 'şəhər');
  assert.strictEqual(normalizeWord('Üzüm', 'az'), 'üzüm');
  assert.strictEqual(normalizeWord('Ölkə', 'az'), 'ölkə');
  assert.strictEqual(normalizeWord('Ğ', 'az'), 'ğ'); // just check
});

test('last letter with ğ rule', () => {
  assert.strictEqual(lastLetter('Yağ', 'az'), 'a'); // ends with ğ, use previous
  assert.strictEqual(lastLetter('Balıq', 'az'), 'q');
});

test('english normalization and last letter', () => {
  assert.strictEqual(normalizeWord('Hello', 'en'), 'hello');
  assert.strictEqual(lastLetter('Cat', 'en'), 't');
});

test('chain validation', () => {
  const dict = new Set(['alma', 'meyvə']);
  const used = new Set();
  const res1 = validateWord({ word: 'alma', lang: 'az', dictSet: dict, usedSet: used, lastWord: null, lastPlayerId: null, playerId: '1' });
  assert.strictEqual(res1.ok, true);
  used.add(res1.word);
  // res1.word is normalized to lowercase
  const res2 = validateWord({ word: 'Meyvə', lang: 'az', dictSet: dict, usedSet: used, lastWord: res1.word, lastPlayerId: '1', playerId: '2' });
  if (res2.ok) {
    used.add(res2.word);
  }
  const res3 = validateWord({ word: 'meyve', lang: 'az', dictSet: dict, usedSet: used, lastWord: res2.word || 'meyvə', lastPlayerId: '2', playerId: '1' });
  assert.strictEqual(res3.ok, false); // not found or wrong form
});

test('used word detection', () => {
  const dict = new Set(['alma']);
  const used = new Set(['alma']);
  const res = validateWord({ word: 'alma', lang: 'az', dictSet: dict, usedSet: used, lastWord: null, lastPlayerId: null, playerId: '1' });
  assert.strictEqual(res.ok, false);
});

test('same player twice', () => {
  const dict = new Set(['alma', 'lale']);
  const used = new Set();
  const res1 = validateWord({ word: 'alma', lang: 'az', dictSet: dict, usedSet: used, lastWord: null, lastPlayerId: null, playerId: '1' });
  used.add(res1.word);
  const res2 = validateWord({ word: 'lale', lang: 'az', dictSet: dict, usedSet: used, lastWord: res1.word, lastPlayerId: '1', playerId: '1' });
  assert.strictEqual(res2.ok, false);
});
