const { SlashCommandBuilder } = require('discord.js');
const music = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music, clear the queue, and leave the voice channel'),
  category: 'Music',
  async run({ interaction, message, isSlash, guild }) {
    const stopped = music.stop(guild);
    const content = stopped
      ? '⏹️ Stopped the music and cleared the queue.'
      : 'I am not playing anything right now.';
    return isSlash ? interaction.reply(content) : message.reply(content);
  }
};
