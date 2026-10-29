const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../utils/database');
const { LOG_CATEGORIES, CATEGORY_KEYS } = require('../utils/logs');

const LOG_TYPES = Object.entries(LOG_CATEGORIES).reduce((acc, [key, meta]) => {
  acc[key] = { label: `${meta.emoji} ${meta.label}`, description: meta.description };
  return acc;
}, {});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Open the professional logging dashboard'),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild }) {
    if (!isSlash) {
      return message.reply('Please use the slash command `/log` to open the logging dashboard.');
    }

    const settings = db.getSettings(guild.id);
    const mainChannel = settings.auditLogChannel ? guild.channels.cache.get(settings.auditLogChannel) : null;

    const getStatus = (key) => {
      const enabled = settings.eventLogsEnabled && settings.eventLogTypes[key];
      const hasChan = settings.eventLogChannels[key] || mainChannel;
      return enabled && hasChan ? '✅' : '❌';
    };

    const getChan = (key) => {
      if (settings.logMode === 'all-in-one') return mainChannel ? `<#${mainChannel.id}>` : 'None';
      return settings.eventLogChannels[key] ? `<#${settings.eventLogChannels[key]}>` : (mainChannel ? `<#${mainChannel.id}> (Main)` : 'None');
    };

    const modLogs = ['moderation', 'security'].map(key =>
      `${getStatus(key)} **${LOG_TYPES[key].label}**: ${getChan(key)}`
    ).join('\n');

    const genLogs = CATEGORY_KEYS.filter(k => !['moderation', 'security'].includes(k)).map(key =>
      `${getStatus(key)} **${LOG_TYPES[key].label}**: ${getChan(key)}`
    ).join('\n');

    const modeLabel = settings.logMode === 'all-in-one'
      ? '📦 **All-in-One** (Single channel)'
      : '📂 **Categorized** (Separate channels)';

    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setTitle('📜 Server Log Configuration')
      .setThumbnail(guild.iconURL())
      .setDescription(`**Global Settings**\n` +
                    `Status: ${settings.eventLogsEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
                    `Mode: ${modeLabel}\n` +
                    `Primary Channel: ${mainChannel ? `<#${mainChannel.id}>` : 'None'}\n\n` +
                    `**🛡️ Moderation Logs**\n${modLogs}\n\n` +
                    `**📄 General Logs**\n${genLogs}`)
      .setFooter({ text: `Requested by ${interaction.user} | Last updated: ${new Date().toLocaleString()}` })
      .setTimestamp();

    const configMenu = new StringSelectMenuBuilder()
      .setCustomId('lobster_log_config')
      .setPlaceholder('⚙️ Configure a log category...')
      .addOptions(Object.entries(LOG_TYPES).map(([key, type]) => ({
        label: type.label,
        value: key,
        description: type.description
      })));

    const viewMenu = new StringSelectMenuBuilder()
      .setCustomId('lobster_log_view')
      .setPlaceholder('🔍 View log details...')
      .addOptions(Object.entries(LOG_TYPES).map(([key, type]) => ({
        label: type.label,
        value: key,
        description: type.description
      })));

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lobster_log_refresh')
        .setLabel('Refresh Menu')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('lobster_log_setup')
        .setLabel('Set Up Channels')
        .setEmoji('#️⃣')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lobster_log_remove')
        .setLabel('Remove Logs')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(configMenu),
        new ActionRowBuilder().addComponents(viewMenu),
        buttons
      ],
      ephemeral: true
    });
  }
};
