const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Make the bot leave the voice channel'),
  category: 'General',
  async run({ interaction, message, isSlash, guild }) {
    const connection = getVoiceConnection(guild.id);
    if (!connection) return isSlash ? interaction.reply('I am not in a voice channel!') : message.reply('I am not in a voice channel!');

    connection.destroy();
    if (isSlash) await interaction.reply('✅ Left the voice channel.');
    else await message.reply('✅ Left the voice channel.');
  }
};
