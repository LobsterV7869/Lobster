const { EmbedBuilder } = require('discord.js');
const {
  LOG_TYPES,
  MODERATION_TYPES,
  GENERAL_TYPES,
  PANEL_THUMBNAIL,
  PANEL_COLOR,
  SILVER_COLOR
} = require('./categories');

const MAX_FIELD = 1024;
const MAX_FIELDS = 25;
const MAX_DESCRIPTION = 4096;
const MAX_EMBED_TOTAL = 6000;

function truncate(value, max) {
  const text = String(value ?? '');
  if (max <= 0) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value);
}

function formatChannel(guild, channelId) {
  if (!channelId) return 'Not set';
  const channel = guild?.channels?.cache?.get(channelId);
  return channel ? `<#${channelId}>` : `\`${channelId}\` (missing)`;
}

function formatIds(ids, kind) {
  if (!ids?.length) return 'None';
  const prefix = kind === 'role' ? '<@&' : kind === 'user' ? '<@' : '<#';
  return truncate(ids.map(id => `${prefix}${id}>`).join(', '), MAX_FIELD);
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'never';
  const seconds = Math.floor(timestamp / 1000);
  return `<t:${seconds}:f>`;
}

function lineField(name, lines, empty = 'None') {
  const value = (lines || []).filter(Boolean).join('\n') || empty;
  return { name, value: truncate(value, MAX_FIELD), inline: false };
}

function fitEmbedText(description, fields, overhead) {
  let text = description ? truncate(description, MAX_DESCRIPTION) : null;
  let list = fields.slice(0, MAX_FIELDS);
  const total = () => overhead
    + (text?.length || 0)
    + list.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

  while (list.length && total() > MAX_EMBED_TOTAL) list.pop();
  if (text && total() > MAX_EMBED_TOTAL) {
    text = truncate(text, Math.max(0, text.length - (total() - MAX_EMBED_TOTAL)));
  }
  return { description: text, fields: list };
}

function buildEventEmbed(type, payload = {}) {
  const title = truncate(payload.title || type.label, 256);
  const footer = truncate(payload.footer || `🦞 Lobster Logs • ${type.label}`, 2048);
  const author = payload.author?.name
    ? {
        name: truncate(payload.author.name, 256),
        ...(isHttpUrl(payload.author.iconURL) ? { iconURL: payload.author.iconURL } : {}),
        ...(isHttpUrl(payload.author.url) ? { url: payload.author.url } : {})
      }
    : null;

  const fields = [];
  if (payload.target) fields.push({ name: 'Target', value: truncate(payload.target, MAX_FIELD), inline: true });
  if (payload.executorId) {
    fields.push({
      name: 'Executor',
      value: truncate(`<@${payload.executorId}>${payload.executorTag ? ` (\`${payload.executorTag}\`)` : ''}`, MAX_FIELD),
      inline: true
    });
  } else if (payload.executor) {
    fields.push({ name: 'Executor', value: truncate(payload.executor, MAX_FIELD), inline: true });
  }
  if (payload.reason) fields.push({ name: 'Reason', value: truncate(payload.reason, MAX_FIELD) });
  for (const field of payload.fields || []) {
    if (!field || !field.name || field.value === undefined || field.value === null || field.value === '') continue;
    fields.push({
      name: truncate(field.name, 256),
      value: truncate(field.value, MAX_FIELD),
      inline: Boolean(field.inline)
    });
  }

  const overhead = title.length + footer.length + (author?.name.length || 0);
  const fitted = fitEmbedText(payload.description, fields, overhead);
  const date = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const embed = new EmbedBuilder()
    .setColor(payload.color ?? type.color)
    .setTitle(title)
    .setTimestamp(Number.isFinite(date.getTime()) ? date : new Date())
    .setFooter({ text: footer });

  if (fitted.description) embed.setDescription(fitted.description);
  if (fitted.fields.length) embed.addFields(fitted.fields);
  if (author) embed.setAuthor(author);
  if (isHttpUrl(payload.thumbnail)) embed.setThumbnail(payload.thumbnail);
  if (isHttpUrl(payload.image)) embed.setImage(payload.image);
  if (isHttpUrl(payload.url)) embed.setURL(payload.url);
  return embed;
}

function typeStatus(guild, config, type) {
  const typeConfig = config.types[type.key];
  if (!config.enabled) return 'Disabled';
  if (!typeConfig?.enabled) return 'Disabled';
  const channelId = typeConfig.channelId || config.fallbackChannelId;
  if (!channelId) return 'Enabled • no channel';
  return `Enabled • ${formatChannel(guild, channelId)}`;
}

function sectionLines(guild, config, types) {
  return types.map(type => {
    const typeConfig = config.types[type.key];
    const marker = config.enabled && typeConfig?.enabled ? '🟢' : '⚪';
    return `${marker} ${type.emoji} **${type.label}** — ${typeStatus(guild, config, type)}`;
  });
}

function attentionLines(config) {
  const errors = [];
  const missing = [];
  for (const type of LOG_TYPES) {
    const typeConfig = config.types[type.key];
    if (typeConfig?.lastError) {
      errors.push(`⚠️ **${type.label}** — ${truncate(typeConfig.lastError, 200)}`);
    } else if (config.enabled && typeConfig?.enabled && !typeConfig.channelId && !config.fallbackChannelId) {
      missing.push(`⚠️ **${type.label}** — enabled but has no channel yet.`);
    }
  }
  const lines = [...errors, ...missing];
  if (lines.length > 10) return [...lines.slice(0, 9), `…and **${lines.length - 9}** more types need attention.`];
  return lines;
}

function latestUpdate(config) {
  return Math.max(0, ...LOG_TYPES.map(type => config.types[type.key]?.lastUpdated || 0));
}

function buildPanelEmbed(guild, config, requestedBy) {
  const updated = latestUpdate(config);
  const attention = attentionLines(config);
  const fields = [
    lineField('Moderation Logs', sectionLines(guild, config, MODERATION_TYPES)),
    lineField('General Logs', sectionLines(guild, config, GENERAL_TYPES))
  ];
  if (attention.length) fields.unshift(lineField('Needs Attention', attention));

  return new EmbedBuilder()
    .setColor(config.enabled ? PANEL_COLOR : 0x747f8d)
    .setTitle('Lobster Logs')
    .setDescription(
      '**Your server. Your rules.**\n\n' +
      'Choose exactly which events Lobster records, where each log type is delivered, and which channels, roles, or members should be ignored.\n\n' +
      `Status: ${config.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
      `Fallback channel: ${formatChannel(guild, config.fallbackChannelId)}`
    )
    .addFields(fields)
    .setThumbnail(PANEL_THUMBNAIL)
    .setFooter({ text: truncate(`Requested by ${requestedBy?.tag || requestedBy?.username || 'unknown'} | Last updated: ${formatTimestamp(updated)}`, 2048) })
    .setTimestamp();
}

function buildTypeDetailEmbed(guild, config, type) {
  const typeConfig = config.types[type.key];
  const configuredChannel = typeConfig.channelId ? formatChannel(guild, typeConfig.channelId) : null;
  const fallback = config.fallbackChannelId ? `${formatChannel(guild, config.fallbackChannelId)} (fallback)` : 'Not set';
  const fields = [
    { name: 'Status', value: typeConfig.enabled ? '🟢 Enabled' : '⚪ Disabled', inline: true },
    { name: 'Channel', value: configuredChannel || fallback, inline: true },
    { name: 'Ignore bots', value: typeConfig.ignoreBots ? 'Yes' : 'No', inline: true },
    { name: 'What it records', value: truncate(type.description, MAX_FIELD), inline: false }
  ];
  if (type.key === 'message') {
    fields.push({
      name: 'Message content',
      value: 'Full edits and deletions need the privileged Message Content intent. Without it, Lobster logs everything Discord still provides.',
      inline: false
    });
  }
  fields.push(
    { name: 'Ignored channels', value: formatIds(typeConfig.ignoredChannels, 'channel'), inline: false },
    { name: 'Ignored roles', value: formatIds(typeConfig.ignoredRoles, 'role'), inline: false },
    { name: 'Ignored users', value: formatIds(typeConfig.ignoredUsers, 'user'), inline: false }
  );
  if (typeConfig.lastError) {
    fields.push({ name: 'Last error', value: truncate(typeConfig.lastError, MAX_FIELD), inline: false });
  }
  return new EmbedBuilder()
    .setColor(typeConfig.enabled ? type.color : 0x747f8d)
    .setTitle(`${type.emoji} ${type.label}`)
    .setDescription('Select a channel below, toggle this log type, or edit its ignore lists.')
    .addFields(fields)
    .setThumbnail(PANEL_THUMBNAIL)
    .setFooter({ text: truncate(`🦞 Lobster Logs • Last updated: ${formatTimestamp(typeConfig.lastUpdated)}`, 2048) })
    .setTimestamp();
}

function buildSetupEmbed(result) {
  const lines = [];
  if (result.created.length) lines.push(`**Created:** ${result.created.map(channel => `<#${channel.id}>`).join(', ')}`);
  if (result.reused.length) lines.push(`**Reused:** ${result.reused.map(channel => `<#${channel.id}>`).join(', ')}`);
  if (result.skipped.length) lines.push(`**Skipped disabled types:** ${result.skipped.join(', ')}`);
  if (!result.created.length && !result.reused.length) lines.push('No enabled log types needed a channel.');
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('Log channels ready')
    .setDescription(truncate(`${lines.join('\n')}\n\nCategory: ${result.category ? `<#${result.category.id}>` : 'not created'}`, MAX_DESCRIPTION))
    .setThumbnail(PANEL_THUMBNAIL)
    .setFooter({ text: '🦞 Lobster Logs • Private channels for administrators and Lobster' })
    .setTimestamp();
}

function buildRemoveConfirmEmbed() {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Remove logging configuration?')
    .setDescription('This disables every log type and clears each channel assignment. Lobster will stop sending server logs until you run `/logs` and set them up again.')
    .setFooter({ text: 'This confirmation expires in two minutes.' })
    .setTimestamp();
}

function buildRemoveChannelsEmbed() {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Delete the log channels too?')
    .setDescription('Lobster can also delete the private log channels it created. Channels that were reused from your server are never deleted.\n\nChoose **Keep channels** to leave them in place.')
    .setFooter({ text: 'This confirmation expires in two minutes.' })
    .setTimestamp();
}

function buildCancelledEmbed() {
  return new EmbedBuilder()
    .setColor(SILVER_COLOR)
    .setTitle('Removal cancelled')
    .setDescription('Your logging configuration was not changed.')
    .setTimestamp();
}

module.exports = {
  truncate,
  formatChannel,
  formatIds,
  formatTimestamp,
  buildEventEmbed,
  buildPanelEmbed,
  buildTypeDetailEmbed,
  buildSetupEmbed,
  buildRemoveConfirmEmbed,
  buildRemoveChannelsEmbed,
  buildCancelledEmbed
};
