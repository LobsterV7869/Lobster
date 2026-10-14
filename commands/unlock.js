const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel'),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async run({ interaction, message, isSlash, channel, guild }) {
    const settings = db.getSettings(guild.id);
    const lockedChannels = { ...settings.lockedChannels };
    if (!Object.prototype.hasOwnProperty.call(lockedChannels, channel.id)) {
      const response = 'This channel is not locked by Lobster.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: lockedChannels[channel.id] });
    delete lockedChannels[channel.id];
    db.updateSetting(guild.id, 'lockedChannels', lockedChannels);
    const embed = new EmbedBuilder().setColor(0x57f287).setDescription('🔓 This channel has been unlocked.');
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
