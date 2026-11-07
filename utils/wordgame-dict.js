const fs = require('node:fs');
const path = require('node:path');
const { normalizeWord } = require('./wordchain');

let azDict = new Set();
let enDict = new Set();
let azLoaded = false;
let enLoaded = false;

function loadAzDict() {
  try {
    const p = path.join(__dirname, '..', 'data', 'dict-popular.txt');
    if (!fs.existsSync(p)) {
      console.log('dictionary loaded: 0 words (az dict missing)');
      azLoaded = true;
      azDict = new Set();
      return azDict;
    }
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const w = normalizeWord(lines[i], 'az');
      if (!w) continue;
      if (!/^[a-zçəğışöü]+$/.test(w)) continue;
      if (w.length < 2) continue;
      azDict.add(w);
    }
    console.log(`dictionary loaded: ${azDict.size} words`);
    azLoaded = true;
    return azDict;
  } catch (e) {
    console.error('Failed to load az dictionary:', e.message);
    azLoaded = true;
    azDict = new Set();
    return azDict;
  }
}

function loadEnDict() {
  try {
    const candidates = [
      path.join(__dirname, '..', 'data', 'en-words.txt'),
      path.join(__dirname, '..', 'data', 'english-words.txt'),
      path.join(__dirname, '..', 'assets', 'en-words.txt')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const w = normalizeWord(lines[i], 'en');
          if (!w) continue;
          if (!/^[a-z]+$/.test(w)) continue;
          if (w.length < 2) continue;
          enDict.add(w);
        }
        console.log(`english dictionary loaded: ${enDict.size} words`);
        enLoaded = true;
        return enDict;
      }
    }
    // try /usr/share/dict/words
    try {
      const p2 = '/usr/share/dict/words';
      if (fs.existsSync(p2)) {
        const content = fs.readFileSync(p2, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const w = normalizeWord(lines[i], 'en');
          if (!w) continue;
          if (!/^[a-z]+$/.test(w)) continue;
          if (w.length < 2) continue;
          // skip proper nouns with capitals? normalizeWord lowercases
          enDict.add(w);
        }
        console.log(`english dictionary loaded: ${enDict.size} words`);
        enLoaded = true;
        return enDict;
      }
    } catch (e) {}
    console.log('english dictionary loaded: 0 words');
    enLoaded = true;
    enDict = new Set();
    return enDict;
  } catch (e) {
    console.error('Failed to load en dictionary:', e.message);
    enLoaded = true;
    enDict = new Set();
    return enDict;
  }
}

function getDict(lang) {
  if (lang === 'en') {
    if (!enLoaded) loadEnDict();
    return enDict;
  }
  if (!azLoaded) loadAzDict();
  return azDict;
}

module.exports = { loadAzDict, loadEnDict, getDict };
