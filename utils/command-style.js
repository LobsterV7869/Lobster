'use strict';

const { EmbedBuilder } = require('discord.js');

const LOBSTER_ORANGE = 0xff6b35;
const LOBSTER_FOOTER = '🦞 Lobster';
const MAX_DESCRIPTION = 4000;
const MAX_EMBEDS = 10;

function normalizeEmbed(value) {
  const embed = value instanceof EmbedBuilder ? value : EmbedBuilder.from(value);
  if (!embed.data.color && embed.data.color !== 0) embed.setColor(LOBSTER_ORANGE);
  if (!embed.data.footer) embed.setFooter({ text: LOBSTER_FOOTER });
  return embed;
}

function chunkText(text) {
  if (text.length <= MAX_DESCRIPTION) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (line.length > MAX_DESCRIPTION) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let index = 0; index < line.length; index += MAX_DESCRIPTION) {
        chunks.push(line.slice(index, index + MAX_DESCRIPTION));
      }
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > MAX_DESCRIPTION) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function textEmbeds(text) {
  return chunkText(text)
    .slice(0, MAX_EMBEDS)
    .map(chunk => new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setDescription(chunk)
      .setFooter({ text: LOBSTER_FOOTER }));
}

function stylePayload(command, payload) {
  const normalized = typeof payload === 'string' ? { content: payload } : { ...payload };

  if (Array.isArray(normalized.embeds) && normalized.embeds.length) {
    normalized.embeds = normalized.embeds.slice(0, MAX_EMBEDS).map(normalizeEmbed);
    return normalized;
  }

  const text = typeof normalized.content === 'string' ? normalized.content.trim() : '';
  if (!text) return normalized;

  if ((normalized.files?.length) || (normalized.attachments?.length)) {
    return normalized;
  }

  normalized.embeds = textEmbeds(text);
  delete normalized.content;
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
