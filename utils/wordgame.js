const words = {
  en: ['apple', 'book', 'cat', 'dog', 'tree', 'sun', 'moon', 'house', 'water', 'fire', 'friend', 'school', 'happy', 'time', 'world'],
  az: ['alma', 'kitab', 'pişik', 'it', 'ağac', 'günəş', 'ay', 'ev', 'su', 'od', 'dost', 'məktəb', 'xoşbəxt', 'vaxt', 'dünya']
};

function getRandomWord() {
  const index = Math.floor(Math.random() * words.en.length);
  return { en: words.en[index], az: words.az[index] };
}

module.exports = { getRandomWord };
