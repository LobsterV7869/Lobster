const URL_RE = /^https?:\/\/\S+$/i;
const EMOJI_REF = /^<(a?):(\w{2,32}):(\d{15,25})>$/;
const EMOJI_ANYWHERE = /<(a?):(\w{2,32}):(\d{15,25})>/;

function emojiFromRef(input) {
  const match = EMOJI_REF.exec(String(input || '').trim());
  if (!match) return null;
  const animated = match[1] === 'a';
  return {
    name: match[2],
    animated,
    url: `https://cdn.discordapp.com/emojis/${match[3]}.${animated ? 'gif' : 'png'}?size=160&quality=lossless`
  };
}

function findEmojiInContent(content) {
  const match = EMOJI_ANYWHERE.exec(String(content || ''));
  return match ? emojiFromRef(`<${match[1]}:${match[2]}:${match[3]}>`) : null;
}

function isURL(value) {
  return URL_RE.test(String(value || '').trim());
}

function isImage(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.name || attachment.url || '');
}

function nameFromURL(url) {
  try {
    const path = new URL(url).pathname;
    const base = path.split('/').pop() || '';
    return base.replace(/\.[a-z0-9]+$/i, '') || null;
  } catch {
    return null;
  }
}

function sanitizeName(input) {
  if (!input) return null;
  const ref = emojiFromRef(input);
  if (ref) return ref.name;
  const cleaned = String(input).trim().replace(/:/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || null;
}

// Figures out the target name + image source for an emoji/sticker upload from
// slash options, prefix arguments, the message's own attachments, or a replied
// message (attachment, sticker, or pasted custom emoji).
async function resolveExpression({ tokens = [], nameOption, sourceOption, imageOption, message, allowSticker = false }) {
  let name = nameOption ? sanitizeName(nameOption) : null;
  let source = sourceOption && String(sourceOption).trim() ? String(sourceOption).trim() : null;

  for (const token of tokens) {
    if (!token) continue;
    const ref = emojiFromRef(token);
    if (ref) {
      if (!source) source = ref.url;
      if (!name) name = ref.name;
      continue;
    }
    if (isURL(token)) {
      if (!source) source = token;
      continue;
    }
    if (!name) name = sanitizeName(token);
  }

  let size = null;
  if (imageOption?.url) {
    source = source || imageOption.url;
    size = imageOption.size ?? size;
  }

  if (!source && message?.attachments?.size) {
    const attachment = message.attachments.find(isImage);
    if (attachment) {
      source = attachment.url;
      size = attachment.size;
    }
  }

  if (!source && message?.reference) {
    const reference = await message.fetchReference().catch(() => null);
    if (reference) {
      const attachment = reference.attachments?.find(isImage);
      if (attachment) {
        source = attachment.url;
        size = attachment.size;
      }
      if (!source && allowSticker && reference.stickers?.size) {
        const sticker = reference.stickers.first();
        source = sticker.url;
      }
      if (!source) {
        const refEmoji = findEmojiInContent(reference.content);
        if (refEmoji) {
          source = refEmoji.url;
          if (!name) name = refEmoji.name;
        }
      }
    }
  }

  if (!name && source) name = sanitizeName(nameFromURL(source));

  return { name, source, size };
}

module.exports = { resolveExpression, sanitizeName, emojiFromRef, findEmojiInContent, isImage };
