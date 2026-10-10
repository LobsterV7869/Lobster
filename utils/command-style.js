const { EmbedBuilder } = require('discord.js');

const LOBSTER_ORANGE = 0xff6b35;
const LOBSTER_FOOTER = '🦞 Lobster';

function flattenEmbed(value) {
  const embed = value instanceof EmbedBuilder ? value.toJSON() : { ...value };
  const parts = [];
  if (embed.author?.name) parts.push(embed.author.name);
  if (embed.title) parts.push(embed.title);
  if (embed.description) parts.push(embed.description);
  for (const field of embed.fields || []) {
    const lines = [field.name, field.value].filter(Boolean);
    if (lines.length) parts.push(lines.join('\n'));
  }
  for (const media of [embed.image?.url, embed.video?.url]) {
    if (typeof media === 'string' && media.length > 0 && !media.startsWith('attachment://')) parts.push(media);
  }
  if (embed.footer?.text) parts.push(embed.footer.text);
  return parts.join('\n');
}

function stylePayload(command, payload, context) {
  const normalized = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!normalized.embeds?.length) return normalized;

  const flattened = normalized.embeds.map(flattenEmbed).filter(Boolean).join('\n\n');
  delete normalized.embeds;
  const text = [normalized.content, flattened]
    .filter(part => typeof part === 'string' && part.length > 0)
    .join('\n\n');
  if (text) normalized.content = text.slice(0, 4000);
  else if (!normalized.files?.length) normalized.content = ' ';
  return normalized;
}

function proxiedMessage(message, command, context) {
  if (!message || (typeof message !== 'object' && typeof message !== 'function')) return message;
  return new Proxy(message, {
    get(target, property) {
      if (property === 'reply') {
        return payload => Promise.resolve(Reflect.apply(target.reply, target, [
          stylePayload(command, payload, context)
        ])).then(reply => proxiedMessage(reply, command, context));
      }
      if (property === 'channel') return proxiedChannel(target.channel, command, context);
      if (property === 'edit') {
        return payload => Promise.resolve(Reflect.apply(target.edit, target, [
          stylePayload(command, payload, context)
        ])).then(reply => proxiedMessage(reply, command, context));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function proxiedChannel(channel, command, context) {
  if (!channel) return channel;
  return new Proxy(channel, {
    get(target, property) {
      if (property === 'send') {
        if (command.data.name === 'speak') {
          return payload => Reflect.apply(target.send, target, [payload]);
        }
        return payload => Promise.resolve(Reflect.apply(target.send, target, [
          stylePayload(command, payload, context)
        ])).then(reply => proxiedMessage(reply, command, context));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function proxiedInteraction(interaction, command, context) {
  if (!interaction) return interaction;
  const styledMethods = new Set(['reply', 'editReply', 'followUp', 'update']);
  return new Proxy(interaction, {
    get(target, property) {
      if (styledMethods.has(property)) {
        return payload => Promise.resolve(Reflect.apply(target[property], target, [
          stylePayload(command, payload, context)
        ])).then(reply => proxiedMessage(reply, command, context));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function styledContext(command, context) {
  const styled = { ...context };
  styled.message = proxiedMessage(context.message, command, styled);
  styled.channel = proxiedChannel(context.channel, command, styled);
  styled.interaction = proxiedInteraction(context.interaction, command, styled);
  return styled;
}

module.exports = { LOBSTER_ORANGE, LOBSTER_FOOTER, stylePayload, styledContext };
