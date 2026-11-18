/**
 * Central auto-convert layer: wraps reply methods for one command execution and
 * converts text/embed payloads to canvas cards. Never crashes the bot.
 * Safeguards: render timeout, single in-flight render, memory/complexity guards.
 * @module canvas/autoConvert
 */

const { renderCard } = require('./index');

const TIMEOUT_MS = 2500;
const MAX_INFLIGHT = 1;
const HEAP_LIMIT_MB = Number(process.env.CANVAS_AUTO_HEAP_LIMIT_MB || 380);
const RSS_LIMIT_MB = Number(process.env.CANVAS_AUTO_RSS_LIMIT_MB || 620);
const MAX_TEXT_LEN = 4000;
const MAX_EMBEDS = 10;

let inflight = 0;
let lastSkipLog = 0;

function logSkip(commandName, reason) {
  const now = Date.now();
  if (now - lastSkipLog < 15000) return;
  lastSkipLog = now;
  console.log(`[canvas/auto] skip ${commandName || 'command'}: ${reason}`);
}

function isAutoDisabled(command) {
  if (command && command.canvas === false) return true;
  const mode = String(process.env.CANVAS_AUTO || '0'); // default OFF for safety on small servers
  if (mode === '0' || mode === 'false' || mode === 'off') return true;
  if (mode === '1' || mode === 'true' || mode === 'on') return false;
  // allowlist mode: CANVAS_AUTO=allowlist and CANVAS_AUTO_COMMANDS=ping,help,userinfo
  if (mode === 'allowlist') {
    const name = String(command?.data?.name || '').toLowerCase();
    const allow = String(process.env.CANVAS_AUTO_COMMANDS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
    return !allow.includes(name);
  }
  return true; // unknown -> off
}

function memoryPressured() {
  try {
    const m = process.memoryUsage();
    const heapMb = m.heapUsed / 1048576;
    const rssMb = m.rss / 1048576;
    return heapMb > HEAP_LIMIT_MB || rssMb > RSS_LIMIT_MB;
  } catch (e) {
    return false;
  }
}

function toEmbedData(embed) {
  if (!embed) return null;
  if (typeof embed.toJSON === 'function') return embed.toJSON();
  if (embed.data && typeof embed.data === 'object') return embed.data;
  if (typeof embed === 'object') return embed;
  return null;
}

function hasMedia(embedData) {
  if (!embedData) return false;
  if (embedData.image?.url || embedData.image?.proxy_url) return true;
  if (embedData.video?.url || embedData.video?.proxy_url) return true;
  if (embedData.thumbnail?.url || embedData.thumbnail?.proxy_url) return true;
  return false;
}

function hasPingingMentions(content, payload) {
  const text = typeof content === 'string' ? content : '';
  const am = payload?.allowedMentions || payload?.allowed_mentions;
  if (am && am.parse?.length === 0 && !am.users?.length && !am.roles?.length && !am.repliedUser && !am.replied_user) {
    return false;
  }
  return /<@!?&?\d+>|@everyone|@here/.test(text);
}

function stripForCard(text, context) {
  let s = String(text == null ? '' : text);
  if (s.length > 2000) s = s.slice(0, 2000);
  const guild = context?.guild || context?.interaction?.guild || context?.message?.guild;
  const client = context?.client || context?.interaction?.client || context?.message?.client;
  s = s.replace(/<@!?(\d+)>/g, (_, id) => {
    const m = guild?.members?.cache?.get(id);
    if (m?.displayName) return m.displayName;
    const u = client?.users?.cache?.get(id);
    return u?.username || 'user';
  });
  s = s.replace(/<@&(\d+)>/g, (_, id) => guild?.roles?.cache?.get(id)?.name || 'role');
  s = s.replace(/<#(\d+)>/g, (_, id) => guild?.channels?.cache?.get(id)?.name || 'channel');
  s = s.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''));
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  s = s.replace(/~~([^~]+)~~/g, '$1');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function normalizePayload(args, methodName) {
  if (args.length === 0) return { payload: {}, rest: [] };
  let payload = args[0];
  let rest = args.slice(1);
  if (typeof payload === 'string') {
    if (methodName === 'reply' && rest[0] && typeof rest[0] === 'object') {
      payload = { content: payload, ...rest[0] };
      rest = [];
    } else {
      payload = { content: payload };
    }
  }
  if (!payload || typeof payload !== 'object') payload = { content: String(payload ?? '') };
  return { payload: { ...payload }, rest };
}

function resultTypeFromText(text) {
  const s = String(text || '').trim();
  if (/^(error|failed|failure|denied|cannot|can't|❌|✖|🚫|⛔)/i.test(s)) return 'error';
  if (/^(warn|warning|missing|⚠)/i.test(s)) return 'warning';
  if (/^(success|done|ok|added|removed|banned|kicked|✅|✔|☑)/i.test(s)) return 'success';
  return 'info';
}

function resultTypeFromColor(color) {
  if (color == null) return 'info';
  const c = Number(color);
  if (!Number.isFinite(c)) return 'info';
  if (c === 0x57f287 || c === 0x22c55e || c === 0x2ecc71 || c === 0x00ff00) return 'success';
  if (c === 0xed4245 || c === 0xef4444 || c === 0xe74c3c || c === 0xff0000 || c === 0xdc2626) return 'error';
  if (c === 0xfee75c || c === 0xf1c40f || c === 0xf59e0b || c === 0xf97316 || c === 0xffa500) return 'warning';
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (g > 150 && r < 140 && b < 140) return 'success';
  if (r > 170 && g < 120 && b < 120) return 'error';
  if (r > 180 && g > 140 && b < 100) return 'warning';
  return 'info';
}

function splitLines(text, max = 40) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, max);
}

async function convertPayload(payload, context, commandName) {
  const convertedFlag = Symbol.for('lobster.canvas.converted');
  if (payload && payload[convertedFlag]) return null;
  if (payload?.files?.length) return null;
  if (payload?.attachments?.length) return null;
  if (hasPingingMentions(payload?.content, payload)) return null;
  if (memoryPressured()) { logSkip(commandName, 'memory pressure'); return null; }
  if (inflight >= MAX_INFLIGHT) { logSkip(commandName, 'busy'); return null; }

  const embedsRaw = Array.isArray(payload?.embeds) ? payload.embeds.slice(0, MAX_EMBEDS) : (payload?.embed ? [payload.embed] : []);
  const embeds = embedsRaw.map(toEmbedData).filter(Boolean);
  if (embeds.some(hasMedia)) return null;

  const content = typeof payload?.content === 'string' ? payload.content : '';
  if (content.length > MAX_TEXT_LEN) return null;
  const cleanContent = stripForCard(content, context);

  let cardType = null;
  let cardData = null;

  if (embeds.length === 1) {
    const e = embeds[0];
    const title = stripForCard(e.title || e.author?.name || '', context) || 'Lobster';
    const desc = stripForCard(e.description || '', context);
    const fields = Array.isArray(e.fields) ? e.fields : [];
    const footer = stripForCard(e.footer?.text || '', context);
    const longDesc = desc.length > 260 || desc.split(/\n/).length > 5;
    if (fields.length > 8 || longDesc) {
      const items = [];
      if (desc) for (const line of splitLines(desc, 30)) items.push({ name: line.slice(0, 90), description: '' });
      for (const f of fields.slice(0, 20)) items.push({ name: stripForCard(f.name, context).slice(0, 80) || 'Item', description: stripForCard(f.value, context).slice(0, 140) });
      const total = Math.max(1, Math.ceil(items.length / 10) || 1);
      cardType = 'list';
      cardData = { title: title.slice(0, 80), items: items.slice(0, 10), page: 1, totalPages: total, iconType: 'info' };
    } else if (fields.length >= 1 && fields.length <= 8) {
      cardType = 'info';
      cardData = {
        title: title.slice(0, 80),
        subtitle: desc.slice(0, 120) || undefined,
        iconType: 'info',
        stats: fields.slice(0, 8).map(f => ({ label: stripForCard(f.name, context).slice(0, 40) || '—', value: stripForCard(f.value, context).slice(0, 60) || '—' })),
        footer: footer.slice(0, 80) || undefined,
      };
    } else {
      cardType = 'result';
      cardData = { type: resultTypeFromColor(e.color), title: title.slice(0, 80), description: desc.slice(0, 500) };
    }
  } else if (embeds.length > 1) {
    const items = embeds.slice(0, 10).map(e => ({
      name: stripForCard(e.title || e.author?.name || 'Item', context).slice(0, 80),
      description: stripForCard(e.description || '', context).slice(0, 140),
    }));
    cardType = 'list';
    cardData = { title: 'Lobster', items, page: 1, totalPages: Math.max(1, Math.ceil(embeds.length / 10)), iconType: 'info' };
  } else if (cleanContent) {
    cardType = 'result';
    cardData = { type: resultTypeFromText(content), title: 'Lobster', description: cleanContent.slice(0, 500) };
  } else {
    return null;
  }

  inflight++;
  let buffer;
  try {
    buffer = await Promise.race([
      renderCard(cardType, cardData),
      new Promise((_, rej) => setTimeout(() => rej(new Error('render timeout')), TIMEOUT_MS)),
    ]);
  } finally {
    inflight = Math.max(0, inflight - 1);
  }

  if (!Buffer.isBuffer(buffer) || buffer.length < 100) return null;

  const { AttachmentBuilder } = require('discord.js');
  const attachment = new AttachmentBuilder(buffer, { name: 'card.png' });
  const files = Array.isArray(payload.files) ? [...payload.files, attachment] : [attachment];
  const next = { ...payload, files, content: '', embeds: [] };
  try { Object.defineProperty(next, convertedFlag, { value: true, enumerable: false }); } catch (e) {}
  return next;
}

function isInteractionLike(obj) {
  return !!obj && (typeof obj.deferReply === 'function' || obj.commandId != null) && typeof obj.editReply === 'function';
}

function quickSkip(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.files?.length || payload.attachments?.length) return true;
  if (hasPingingMentions(payload?.content, payload)) return true;
  const embedsRaw = Array.isArray(payload?.embeds) ? payload.embeds : (payload?.embed ? [payload.embed] : []);
  const embeds = embedsRaw.map(toEmbedData).filter(Boolean);
  if (embeds.some(hasMedia)) return true;
  const content = typeof payload?.content === 'string' ? payload.content : '';
  if (content.length > MAX_TEXT_LEN) return true;
  return false;
}

function wrapMethod(obj, methodName, original, context, commandName) {
  return async function wrapped(...args) {
    try {
      const { payload, rest } = normalizePayload(args, methodName);

      // Initial slash interaction reply: defer first to guarantee 3s ack, then convert+edit.
      if (methodName === 'reply' && isInteractionLike(obj) && !obj.deferred && !obj.replied) {
        if (quickSkip(payload)) {
          return await original.call(this, payload, ...rest);
        }
        try {
          await obj.deferReply({ ephemeral: !!payload.ephemeral, flags: payload.flags }).catch(() => {});
        } catch (e) {
          // if defer fails, fall back to original behavior
          return await original.call(this, payload, ...rest);
        }
        let next = payload;
        try {
          const converted = await convertPayload(payload, context, commandName);
          if (converted) next = converted;
        } catch (e) {
          console.log(`[canvas/auto] fallback ${commandName || 'command'}: ${e?.message || e}`);
          next = payload;
        }
        if (typeof next === 'string') return await obj.editReply({ content: next });
        return await obj.editReply(next);
      }

      let next = payload;
      try {
        const converted = await convertPayload(payload, context, commandName);
        if (converted) next = converted;
      } catch (e) {
        console.log(`[canvas/auto] fallback ${commandName || 'command'}: ${e?.message || e}`);
        next = payload;
      }
      if (typeof next === 'string') return await original.call(this, next, ...rest);
      return await original.call(this, next, ...rest);
    } catch (e) {
      console.log(`[canvas/auto] fallback ${commandName || 'command'}: ${e?.message || e}`);
      return original.apply(this, args);
    }
  };
}

function wrapTarget(target, methods, context, commandName) {
  if (!target) return () => {};
  const originals = [];
  for (const method of methods) {
    const orig = target[method];
    if (typeof orig !== 'function') continue;
    originals.push([method, orig]);
    target[method] = wrapMethod(target, method, orig.bind(target), context, commandName);
  }
  return () => {
    for (const [method, orig] of originals) {
      try { target[method] = orig; } catch (e) {}
    }
  };
}

/**
 * Install auto-convert wrappers for one command execution. Returns restore().
 * @param {object} context
 * @param {object} command
 * @returns {() => void}
 */
function installAutoConvert(context, command) {
  if (isAutoDisabled(command)) return () => {};
  const name = command?.data?.name || 'command';
  if (memoryPressured()) { logSkip(name, 'memory pressure'); return () => {}; }
  const restores = [];
  try {
    if (context?.interaction) {
      restores.push(wrapTarget(context.interaction, ['reply', 'editReply', 'followUp'], context, name));
    }
    if (context?.message) {
      restores.push(wrapTarget(context.message, ['reply'], context, name));
    }
  } catch (e) {
    console.log(`[canvas/auto] fallback ${name}: ${e?.message || e}`);
  }
  return () => { for (const r of restores) try { r(); } catch (e) {} };
}

module.exports = { installAutoConvert, stripForCard, convertPayload };
