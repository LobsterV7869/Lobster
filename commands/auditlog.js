const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const {
  getLogConfig,
  setFallbackChannel,
  setGlobalEnabled
} = require('../utils/logging/config');
const { LOG_TYPES } = require('../utils/logging/categories');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditlog')
    .setDescription('View or quickly change the fallback server log channel')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Fallback log channel; leave empty to view the current setting')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable all event logs')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, guild }) {
    const selectedChannel = isSlash
      ? interaction.options.getChannel('channel')
      : message.mentions.channels.first() || guild.channels.cache.get(args.find(arg =>
        /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)
      ));
    const state = isSlash
      ? interaction.options.getBoolean('enabled')
      : args.some(arg => ['off', 'disable', 'disabled'].includes(arg.toLowerCase())) ? false
        : args.some(arg => ['on', 'enable', 'enabled'].includes(arg.toLowerCase())) ? true : null;

    if (state !== null) setGlobalEnabled(guild.id, state);

    if (selectedChannel) {
      if (!selectedChannel.isTextBased()) {
        const response = '📝 Choose a text channel to receive event logs.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (!selectedChannel.permissionsFor(guild.members.me)
        ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        const response = 'I need View Channel, Send Messages, and Embed Links access in the selected log channel.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      setFallbackChannel(guild.id, selectedChannel.id);
      if (state !== false) setGlobalEnabled(guild.id, true);
    }

    const config = getLogConfig(guild.id);
    const enabled = LOG_TYPES.filter(type => config.types[type.key]?.enabled);
    const fallback = config.fallbackChannelId ? guild.channels.cache.get(config.fallbackChannelId) : null;
    const dedicated = enabled.filter(type => config.types[type.key].channelId).length;
    const active = config.enabled && enabled.length > 0 && Boolean(fallback || dedicated);
    let description;
    if (!config.enabled) {
      description = 'Event logs are disabled. Run `/logs` to choose what to record.';
    } else if (!active) {
      description = 'Event logs are enabled, but no log channels are configured yet. Run `/logs` to set them up.';
    } else {
      description = `Logging is enabled for **${enabled.length}** type${enabled.length === 1 ? '' : 's'}.`
        + `\n**Fallback channel:** ${fallback ? `<#${fallback.id}>` : 'not set'}`
        + `\n**Dedicated channels:** **${dedicated}**`
        + '\n\nUse `/logs` to configure each type or change its channel.';
    }

    const embed = new EmbedBuilder()
      .setColor(active ? 0x1f3a5f : 0x747f8d)
      .setTitle('Server event logs')
      .setDescription(description)
      .setFooter({ text: 'Message edit and delete logs may include content when Lobster can read messages.' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
