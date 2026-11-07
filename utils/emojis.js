const { PermissionFlagsBits } = require('discord.js');

let cachedZoom = null;
let cachedZoomReaction = null;
let logged = false;

function fallbackText() {
  return '✅';
}

function findZoom(client) {
  if (!client) return null;
  if (client.application?.emojis?.cache) {
    for (const emoji of client.application.emojis.cache.values()) {
      if (emoji.name && emoji.name.toLowerCase() === 'zoom_face') return emoji;
      if (emoji.name && emoji.name.toLowerCase() === 'zoomface') return emoji;
    }
  }
  if (client.emojis?.cache) {
    for (const emoji of client.emojis.cache.values()) {
      if (emoji.name && emoji.name.toLowerCase() === 'zoom_face') return emoji;
      if (emoji.name && emoji.name.toLowerCase() === 'zoomface') return emoji;
    }
  }
  return null;
}

async function loadZoomEmojis(client) {
  try {
    if (client.application?.emojis?.fetch) {
      await client.application.emojis.fetch().catch(() => {});
    }
  } catch (e) {
    // ignore
  }
  const emoji = findZoom(client);
  if (emoji) {
    cachedZoom = emoji.toString();
    cachedZoomReaction = emoji;
  } else {
    cachedZoom = fallbackText();
    cachedZoomReaction = '✅';
  }
  if (!logged) {
    logged = true;
    const appEmojis = client.application?.emojis?.cache ? Array.from(client.application.emojis.cache.values()).map(e => `${e.name}:${e.id}:${e.animated ? 'animated' : 'static'}`) : [];
    const guildEmojis = client.emojis?.cache ? Array.from(client.emojis.cache.values()).map(e => `${e.name}:${e.id}:${e.animated ? 'animated' : 'static'}`) : [];
    console.log(`[emojis] zoom_face lookup - found:${emoji ? emoji.name : 'none'} id:${emoji ? emoji.id : 'n/a'} animated:${emoji ? emoji.animated : 'n/a'}`);
    if (!emoji) {
      console.log(`[emojis] available app emojis: ${appEmojis.length ? appEmojis.join(', ') : 'none'}`);
      console.log(`[emojis] available guild emojis: ${guildEmojis.length ? guildEmojis.join(', ') : 'none'}`);
    }
  }
  return { zoom: cachedZoom, zoomReaction: cachedZoomReaction, found: !!emoji };
}

function zoom() {
  return cachedZoom || fallbackText();
}

function zoomReaction() {
  return cachedZoomReaction || '✅';
}

function zoomText() {
  return cachedZoom === '✅' ? '✅' : cachedZoom;
}

module.exports = { loadZoomEmojis, zoom, zoomReaction, zoomText };
