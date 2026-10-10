const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Enable or disable the counting system')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Text channel for counting')
      .addChannelTypes(ChannelType.GuildText))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable counting')),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions
  ],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const channel = isSlash
      ? interaction.options.getChannel('channel')
      : message.mentions.channels.first() || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg)));
    const stateArg = args.find(arg => ['on', 'enable', 'enabled', 'off', 'disable', 'disabled'].includes(arg.toLowerCase()));
    const requestedState = isSlash
      ? interaction.options.getBoolean('enabled')
      : stateArg ? ['on', 'enable', 'enabled'].includes(stateArg.toLowerCase()) : null;

    if (requestedState === false || (!channel && settings.counting && requestedState !== true)) {
      db.updateSetting(guild.id, 'counting', 0);
      const response = 'Counting has been disabled.';
      return isSlash ? interaction.reply(response) : message.reply(response);
    }

    const targetChannel = channel || guild.channels.cache.get(settings.countingChannel);
    if (requestedState === true && !targetChannel?.isTextBased()) {
      const response = 'Choose a text channel to enable counting.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (targetChannel && !targetChannel.permissionsFor(guild.members.me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions
    ])) {
      const response = 'I need View Channel, Send Messages, Read Message History, and Add Reactions in the counting channel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (!targetChannel) {
      const response = `Counting is disabled. Specify a text channel to enable it, or use \`${settings.prefix} counting off\`.`;
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    db.updateSetting(guild.id, 'counting', 1);
    db.updateSetting(guild.id, 'countingChannel', targetChannel.id);
    if (!settings.counting || channel) {
      db.updateSetting(guild.id, 'lastCount', 0);
      db.updateSetting(guild.id, 'lastCounter', null);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`Counting is enabled in ${targetChannel}. Start from **${settings.lastCount + 1}**.`);
    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
