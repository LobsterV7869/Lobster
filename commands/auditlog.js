const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditlog')
    .setDescription('Choose where Lobster sends privacy-conscious server event logs')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Log channel; leave empty to view the current setting')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable event logs')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const selectedChannel = isSlash
      ? interaction.options.getChannel('channel')
      : message.mentions.channels.first() || guild.channels.cache.get(args.find(arg =>
        /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)
      ));
    const state = isSlash
      ? interaction.options.getBoolean('enabled')
      : args.some(arg => ['off', 'disable', 'disabled'].includes(arg.toLowerCase())) ? false
        : args.some(arg => ['on', 'enable', 'enabled'].includes(arg.toLowerCase())) ? true : null;

    if (state === false) {
      db.updateSetting(guild.id, 'auditLogChannel', null);
      db.updateSetting(guild.id, 'eventLogsEnabled', false);
    }
    else if (!selectedChannel && state === true) {
      const response = 'Choose a text channel to receive event logs.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (state !== false && selectedChannel) {
      if (!selectedChannel.isTextBased()) {
        const response = 'Choose a text channel to receive event logs.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (!selectedChannel.permissionsFor(guild.members.me)
        ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        const response = 'I need View Channel, Send Messages, and Embed Links access in the selected log channel.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }
    if (state !== false && selectedChannel) {
      db.updateSetting(guild.id, 'auditLogChannel', selectedChannel.id);
      db.updateSetting(guild.id, 'eventLogsEnabled', true);
    }

    const current = db.getSettings(guild.id);
    const channel = current.auditLogChannel
      ? guild.channels.cache.get(current.auditLogChannel)
      : null;
    const dedicatedChannels = Object.values(current.eventLogChannels || {}).filter(Boolean).length;
    const active = current.eventLogsEnabled && (channel || dedicatedChannels > 0);
    const embed = new EmbedBuilder()
      .setColor(active ? 0x5865f2 : 0x747f8d)
      .setTitle('Server event logs')
      .setDescription(active
        ? channel
          ? `Event logs are enabled in ${channel}.`
          : `Event logs are enabled across ${dedicatedChannels} dedicated channel${dedicatedChannels === 1 ? '' : 's'}. Use \`/log\` to manage categories.`
        : 'Event logs are disabled. Choose a channel to enable them.')
      .setFooter({ text: 'Logs include event details only; message contents are never copied.' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
