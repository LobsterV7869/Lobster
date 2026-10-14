const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

const LOG_TYPES = {
  general: { label: 'General', includes: 'Server events and setup activity' },
  moderation: { label: 'Moderation', includes: 'Bans, kicks, timeouts, and AutoMod actions' },
  members: { label: 'Members', includes: 'Member joins, leaves, and profile changes' },
  messages: { label: 'Messages', includes: 'Message edits and deletions; content is never copied' },
  channels: { label: 'Channels', includes: 'Channel creation, changes, and deletion' },
  roles: { label: 'Roles', includes: 'Role creation, changes, and deletion' },
  voice: { label: 'Voice', includes: 'Voice joins, leaves, and channel moves' },
  emojis: { label: 'Emojis', includes: 'Server emoji changes' },
  levels: { label: 'Levels', includes: 'Member level-ups' },
  security: { label: 'Security', includes: 'Anti-nuke alerts and join protection' }
};

function parseState(value) {
  if (['on', 'enable', 'enabled', 'true'].includes(value?.toLowerCase())) return true;
  if (['off', 'disable', 'disabled', 'false'].includes(value?.toLowerCase())) return false;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('View or configure Lobster server event logs')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel that receives server logs')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option
      .setName('enabled')
      .setDescription('Enable or disable event logging'))
    .addStringOption(option => option
      .setName('category')
      .setDescription('Log category to enable or disable')
      .addChoices(...Object.entries(LOG_TYPES).map(([value, type]) => ({
        name: type.label,
        value
      }))))
    .addChannelOption(option => option
      .setName('category_channel')
      .setDescription('Optional dedicated channel for this category')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option
      .setName('category_enabled')
      .setDescription('Enable or disable the selected log category'))
    .addBooleanOption(option => option
      .setName('clear_category_channel')
      .setDescription('Use the main log channel instead of a dedicated channel')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const selectedChannel = isSlash
      ? interaction.options.getChannel('channel')
      : message.mentions.channels.first()
        || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)));
    let selectedCategoryChannel = null;
    const updates = {};
    const channelUpdates = {};
    let loggingEnabled;

    if (isSlash) {
      loggingEnabled = interaction.options.getBoolean('enabled');
      const category = interaction.options.getString('category');
      const categoryEnabled = interaction.options.getBoolean('category_enabled');
      const categoryChannel = interaction.options.getChannel('category_channel');
      const clearCategoryChannel = interaction.options.getBoolean('clear_category_channel');
      selectedCategoryChannel = categoryChannel;
      if (category && categoryEnabled !== null) updates[category] = categoryEnabled;
      else if (!category && (categoryEnabled !== null || categoryChannel || clearCategoryChannel)) {
        const response = 'Choose a log category when changing its settings.';
        return interaction.reply({ content: response, ephemeral: true });
      }
      if (category && categoryChannel) channelUpdates[category] = categoryChannel.id;
      if (category && clearCategoryChannel) channelUpdates[category] = null;
      if ((categoryChannel || clearCategoryChannel) && category) updates[category] = true;
    } else {
      const category = args.find(arg => Object.hasOwn(LOG_TYPES, arg.toLowerCase()))?.toLowerCase();
      const state = args.map(parseState).find(value => value !== null);
      const hasOff = args.some(arg => ['off', 'disable', 'disabled'].includes(arg.toLowerCase()));
      if (category) {
        if (state !== null && state !== undefined) updates[category] = state;
        else if (args.some(arg => arg.toLowerCase() === 'default')) {
          channelUpdates[category] = null;
          updates[category] = true;
        } else if (selectedChannel) {
          channelUpdates[category] = selectedChannel.id;
          updates[category] = true;
        }
        else {
          const response = `${LOG_TYPES[category].label} logs are ${settings.eventLogTypes[category] ? 'enabled' : 'disabled'}.`;
          return message.reply(response);
        }
      } else if (hasOff) {
        loggingEnabled = false;
      } else if (args.some(arg => ['on', 'enable', 'enabled'].includes(arg.toLowerCase()))) {
        loggingEnabled = true;
      }
    }

    const targetChannel = selectedChannel || guild.channels.cache.get(settings.auditLogChannel);
    for (const channel of new Set([selectedChannel, selectedCategoryChannel].filter(Boolean))) {
      if (!channel.isTextBased()) {
        const response = 'Choose a text channel for event logs.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (!channel.permissionsFor(guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ])) {
        const response = 'I need View Channel, Send Messages, and Embed Links in the selected log channel.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }
    const hasDedicatedChannel = Object.values(settings.eventLogChannels).some(Boolean);
    if (loggingEnabled === true && !targetChannel && !hasDedicatedChannel) {
      const response = 'Choose a log channel first.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    if (selectedChannel && !Object.keys(channelUpdates).length) {
      db.updateSetting(guild.id, 'auditLogChannel', selectedChannel.id);
      db.updateSetting(guild.id, 'eventLogsEnabled', true);
    }
    if (loggingEnabled !== undefined && loggingEnabled !== null) {
      db.updateSetting(guild.id, 'auditLogChannel', loggingEnabled ? targetChannel?.id || settings.auditLogChannel : null);
      db.updateSetting(guild.id, 'eventLogsEnabled', loggingEnabled);
    } else if (selectedChannel || selectedCategoryChannel
      || Object.entries(updates).some(([category, enabled]) => enabled && (
        channelUpdates[category] || settings.eventLogChannels[category] || settings.auditLogChannel
      ))) {
      db.updateSetting(guild.id, 'eventLogsEnabled', true);
    }
    if (Object.keys(updates).length) {
      db.updateSetting(guild.id, 'eventLogTypes', { ...settings.eventLogTypes, ...updates });
    }
    if (Object.keys(channelUpdates).length) {
      db.updateSetting(guild.id, 'eventLogChannels', { ...settings.eventLogChannels, ...channelUpdates });
    }

    const updated = db.getSettings(guild.id);
    const mainChannel = updated.auditLogChannel ? guild.channels.cache.get(updated.auditLogChannel) : null;
    const lines = Object.entries(LOG_TYPES).map(([key, type]) =>
      `${updated.eventLogsEnabled && updated.eventLogTypes[key] && (updated.eventLogChannels[key] || mainChannel) ? '🟢' : '⚪'} **${type.label}** · ${type.includes} · ${updated.eventLogChannels[key] ? `<#${updated.eventLogChannels[key]}>` : mainChannel || 'No channel'}`
    );
    const hasActiveChannel = Object.keys(LOG_TYPES).some(key =>
      updated.eventLogsEnabled && updated.eventLogTypes[key] && (updated.eventLogChannels[key] || mainChannel)
    );
    const embed = new EmbedBuilder()
      .setColor(hasActiveChannel ? 0x5865f2 : 0x747f8d)
      .setAuthor({ name: 'Lobster · Server logs' })
      .setTitle('📋 Log settings')
      .setDescription(`${hasActiveChannel ? `**Main log channel:** ${mainChannel || 'Not set'} · Dedicated channels override this per category.` : '**Logging is disabled.** Set a main channel with \`/log channel:#logs\` or assign channels by category.'}\n\n${lines.join('\n')}`)
      .setFooter({ text: 'Use “default” to clear a category channel. Event logs do not copy message contents.' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  },
  LOG_TYPES
};
