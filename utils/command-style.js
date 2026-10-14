'use strict';

const { EmbedBuilder } = require('discord.js');

const LOBSTER_ORANGE = 0xff6b35;
const LOBSTER_FOOTER = '🦞 Lobster';
const MAX_DESCRIPTION = 4000;
const MAX_EMBEDS = 10;
const MAX_FOOTER = 2000;

const CATEGORY_STYLE = {
  General: { emoji: '🛠️', color: 0xff6b35 },
  Moderation: { emoji: '🛡️', color: 0xed4245 },
  Security: { emoji: '🔒', color: 0x992d22 },
  Utility: { emoji: '🔎', color: 0x5865f2 },
  Configuration: { emoji: '⚙️', color: 0x1abc9c },
  Community: { emoji: '👥', color: 0x9b59b6 },
  Music: { emoji: '🎵', color: 0x1db954 },
  Fun: { emoji: '🎮', color: 0xeb459e }
};

const COMMAND_TITLES = {
  nowplaying: 'Now Playing',
  userinfo: 'User Info',
  serverinfo: 'Server Info',
  roleinfo: 'Role Info',
  botinfo: 'Bot Info',
  membercount: 'Member Count',
  servericon: 'Server Icon',
  addrole: 'Add Role',
  removerole: 'Remove Role',
  slowmode: 'Slow Mode',
  reactionrole: 'Reaction Roles',
  autoresponse: 'Auto Responses',
  automod: 'Auto Moderation',
  auditlog: 'Audit Log',
  antiself: 'Anti Self-Bot',
  autorole: 'Auto Role'
};

function styleFor(command) {
  const category = command?.category;
  return (category && CATEGORY_STYLE[category]) || CATEGORY_STYLE.General;
}

function humanize(name) {
  return String(name)
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function commandHeading(command) {
  const style = styleFor(command);
  const name = command?.data?.name;
  if (!name) return `${style.emoji} Lobster`;
  return `${style.emoji} ${COMMAND_TITLES[name] || humanize(name)}`;
}

function footerText(command) {
  const description = command?.data?.description?.trim();
  if (!description) return LOBSTER_FOOTER;
  return `${LOBSTER_FOOTER} · ${description.slice(0, MAX_FOOTER - LOBSTER_FOOTER.length - 3)}`;
}

function normalizeEmbed(value, command) {
  const embed = value instanceof EmbedBuilder ? value : EmbedBuilder.from(value);
  if (!embed.data.color && embed.data.color !== 0) embed.setColor(styleFor(command).color);
  if (!embed.data.footer) embed.setFooter({ text: LOBSTER_FOOTER });
  if (!embed.data.timestamp) embed.setTimestamp();
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

function textEmbeds(text, command) {
  const style = styleFor(command);
  return chunkText(text)
    .slice(0, MAX_EMBEDS)
    .map((chunk, index) => {
      const embed = new EmbedBuilder()
        .setColor(style.color)
        .setDescription(chunk)
        .setFooter({ text: footerText(command) })
        .setTimestamp();
      if (index === 0) embed.setTitle(commandHeading(command));
      return embed;
    });
}

function stylePayload(command, payload) {
  const normalized = typeof payload === 'string' ? { content: payload } : { ...payload };

  if (Array.isArray(normalized.embeds) && normalized.embeds.length) {
    normalized.embeds = normalized.embeds.slice(0, MAX_EMBEDS).map(embed => normalizeEmbed(embed, command));
    return normalized;
  }

  const text = typeof normalized.content === 'string' ? normalized.content.trim() : '';
  if (!text) return normalized;

  if ((normalized.files?.length) || (normalized.attachments?.length)) {
    return normalized;
  }

  normalized.embeds = textEmbeds(text, command);
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

module.exports = { LOBSTER_ORANGE, LOBSTER_FOOTER, CATEGORY_STYLE, stylePayload, styledContext };
