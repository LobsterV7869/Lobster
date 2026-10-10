const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel'),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async run({ interaction, message, isSlash, channel, guild }) {
    const settings = db.getSettings(guild.id);
    const lockedChannels = { ...settings.lockedChannels };
    if (!Object.hasOwn(lockedChannels, channel.id)) {
      const overwrite = channel.permissionOverwrites.cache.get(guild.id);
      lockedChannels[channel.id] = overwrite?.allow.has(PermissionFlagsBits.SendMessages)
        ? true
        : overwrite?.deny.has(PermissionFlagsBits.SendMessages) ? false : null;
      db.updateSetting(guild.id, 'lockedChannels', lockedChannels);
    }
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
    const embed = new EmbedBuilder().setColor('#ff0000').setDescription('🔒 Channel has been locked');
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
