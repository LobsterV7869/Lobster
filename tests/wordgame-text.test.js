const test = require('node:test');
const assert = require('node:assert');
const { t, texts } = require('../utils/wordgame-text');

test('t returns both languages for keys', () => {
  const keys = Object.keys(texts.az);
  for (const k of keys) {
    assert.ok(texts.en.hasOwnProperty(k), `missing key in en: ${k}`);
    const v1 = typeof texts.az[k] === 'function' ? texts.az[k]('M') : texts.az[k];
    const v2 = typeof texts.en[k] === 'function' ? texts.en[k]('M') : texts.en[k];
    assert.ok(typeof v1 === 'string' || typeof v1 === 'object');
    assert.ok(typeof v2 === 'string' || typeof v2 === 'object');
  }
});

test('english helpers', () => {
  assert.strictEqual(t('en', 'not_found'), '❌ That word is not in the dictionary.');
  assert.strictEqual(t('en', 'used'), '❌ That word was already used.');
  assert.strictEqual(t('en', 'same_player'), "❌ You can't play twice in a row.");
  assert.strictEqual(t('en', 'wrong_letter', 'M'), '❌ The word must start with **M**!');
});
