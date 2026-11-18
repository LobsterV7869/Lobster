const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

const MAX_TAGS = 50;
const MAX_IDS = 50;

function normalizeTag(value) {
  return String(value || '').trim().replace(/^#+/, '');
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || '').trim());
}

function uniqueStrings(values, normalize = value => String(value || '').trim()) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function parsePrefixArgs(args) {
  const action = String(args[0] || 'list').toLowerCase();
  const type = String(args[1] || '').toLowerCase();
  const value = args.slice(2).join(' ').trim();
  return { action, type, value };
}

function formatList(title, items, formatter = item => `\`${item}\``) {
  if (!items.length) return `${title}: none`;
  return `${title} (${items.length}):\n${items.map(formatter).join(', ')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blockedtag')
    .setDescription('Block members from joining if they display a blocked server tag or primary guild')
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show blocked server tags and blocked primary guild IDs'))
    .addSubcommand(sub => sub
      .setName('add-tag')
      .setDescription('Block joins from members displaying this server tag')
      .addStringOption(option => option.setName('tag').setDescription('Server tag to block (without #)').setRequired(true).setMaxLength(30)))
    .addSubcommand(sub => sub
      .setName('remove-tag')
      .setDescription('Remove a blocked server tag')
      .addStringOption(option => option.setName('tag').setDescription('Server tag to unblock').setRequired(true).setMaxLength(30)))
    .addSubcommand(sub => sub
      .setName('add-guild')
      .setDescription('Block joins from members whose primary guild ID matches')
      .addStringOption(option => option.setName('id').setDescription('Primary guild/server ID to block').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove-guild')
      .setDescription('Remove a blocked primary guild ID')
      .addStringOption(option => option.setName('id').setDescription('Primary guild/server ID to unblock').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Remove all blocked server tags and guild IDs')),
  category: 'Security',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild, member, user }) {
    const actor = member || interaction?.member || message?.member;
    if (!actor?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      const content = 'You need the Manage Server permission to manage blocked server tags.';
      return isSlash ? interaction.reply({ content, ephemeral: true }) : message.reply(content);
    }

    let action;
    let value;
    if (isSlash) {
      action = interaction.options.getSubcommand();
      value = interaction.options.getString('tag') || interaction.options.getString('id') || '';
    } else {
      const parsed = parsePrefixArgs(args);
      action = parsed.action;
      if (['add', 'remove'].includes(parsed.action)) {
        if (['tag', 'tags'].includes(parsed.type)) action = `${parsed.action}-tag`;
        else if (['guild', 'guilds', 'id', 'ids', 'server'].includes(parsed.type)) action = `${parsed.action}-guild`;
        else action = 'help';
      } else if (parsed.action === 'tags' || parsed.action === 'guilds' || parsed.action === 'ids') {
        action = 'list';
      }
      value = parsed.value;
    }

    if (['add-tag', 'add-guild'].includes(action) && !guild.members.me?.permissions?.has(PermissionFlagsBits.KickMembers)) {
      const content = 'I need the Kick Members permission to enforce blocked server tags/guilds when members join.';
      return isSlash ? interaction.reply({ content, ephemeral: true }) : message.reply(content);
    }

    const settings = db.getSettings(guild.id);
    let blockedTags = uniqueStrings(settings.blockedTags || [], normalizeTag);
    let blockedGuildIds = uniqueStrings(settings.blockedGuildIds || [], v => String(v || '').trim());
    let responseText = '';

    if (action === 'add-tag') {
      const tag = normalizeTag(value);
      if (!tag) {
        responseText = 'Please provide a server tag to block.';
      } else if (blockedTags.length >= MAX_TAGS) {
        responseText = `You can block up to ${MAX_TAGS} server tags.`;
      } else if (blockedTags.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
        responseText = `The server tag \`${tag}\` is already blocked.`;
      } else {
        blockedTags = [...blockedTags, tag];
        db.updateSetting(guild.id, 'blockedTags', blockedTags);
        responseText = `Blocked joins from members displaying the server tag \`${tag}\`.`;
      }
    } else if (action === 'remove-tag') {
      const tag = normalizeTag(value);
      const before = blockedTags.length;
      blockedTags = blockedTags.filter(existing => existing.toLowerCase() !== tag.toLowerCase());
      if (blockedTags.length === before) {
        responseText = `The server tag \`${tag || value}\` is not in the blocked list.`;
      } else {
        db.updateSetting(guild.id, 'blockedTags', blockedTags);
        responseText = `Removed \`${tag}\` from blocked server tags.`;
      }
    } else if (action === 'add-guild') {
      const id = String(value || '').trim();
      if (!isSnowflake(id)) {
        responseText = 'Please provide a valid 17-20 digit primary guild/server ID.';
      } else if (blockedGuildIds.length >= MAX_IDS) {
        responseText = `You can block up to ${MAX_IDS} primary guild IDs.`;
      } else if (blockedGuildIds.includes(id)) {
        responseText = `The primary guild ID \`${id}\` is already blocked.`;
      } else {
        blockedGuildIds = [...blockedGuildIds, id];
        db.updateSetting(guild.id, 'blockedGuildIds', blockedGuildIds);
        responseText = `Blocked joins from members whose primary guild ID is \`${id}\`.`;
      }
    } else if (action === 'remove-guild') {
      const id = String(value || '').trim();
      const before = blockedGuildIds.length;
      blockedGuildIds = blockedGuildIds.filter(existing => existing !== id);
      if (blockedGuildIds.length === before) {
        responseText = `The primary guild ID \`${id || value}\` is not in the blocked list.`;
      } else {
        db.updateSetting(guild.id, 'blockedGuildIds', blockedGuildIds);
        responseText = `Removed \`${id}\` from blocked primary guild IDs.`;
      }
    } else if (action === 'clear') {
      blockedTags = [];
      blockedGuildIds = [];
      db.updateSetting(guild.id, 'blockedTags', blockedTags);
      db.updateSetting(guild.id, 'blockedGuildIds', blockedGuildIds);
      responseText = 'Cleared all blocked server tags and primary guild IDs.';
    } else if (action === 'list') {
      responseText = '';
    } else {
      responseText = isSlash
        ? 'Use the blockedtag subcommands to list, add, remove, or clear blocked server tags and guild IDs.'
        : 'Usage: `l blockedtag list`, `l blockedtag add tag <tag>`, `l blockedtag remove tag <tag>`, `l blockedtag add guild <id>`, `l blockedtag remove guild <id>`, `l blockedtag clear`';
    }

    const current = db.getSettings(guild.id);
    const tags = uniqueStrings(current.blockedTags || [], normalizeTag);
    const ids = uniqueStrings(current.blockedGuildIds || [], v => String(v || '').trim());
    const embed = new EmbedBuilder()
      .setColor(tags.length || ids.length ? 0xE74C3C : 0x5BA6FB)
      .setTitle('Blocked server tags & guilds')
      .setDescription([
        responseText,
        '',
        formatList('Blocked tags', tags),
        '',
        formatList('Blocked primary guild IDs', ids)
      ].filter(Boolean).join('\n'))
      .setFooter({ text: `Managed by ${user?.tag || user?.username || 'staff'} • Requires Kick Members to enforce on join` })
      .setTimestamp();

    return isSlash ? interaction.reply({ embeds: [embed], ephemeral: true }) : message.reply({ embeds: [embed] });
  }
};
