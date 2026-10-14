const { SlashCommandBuilder } = require('discord.js');
const music = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause or resume the current song'),
  category: 'Music',
  async run({ interaction, message, isSlash, guild }) {
    const result = music.togglePause(guild);
    let content;
    if (result === 'paused') content = '⏸️ Paused the music.';
    else if (result === 'resumed') content = '▶️ Resumed the music.';
    else content = 'There is nothing playing right now.';
    return isSlash ? interaction.reply(content) : message.reply(content);
  }
};
