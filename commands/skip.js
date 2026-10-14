const { SlashCommandBuilder } = require('discord.js');
const music = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  category: 'Music',
  async run({ interaction, message, isSlash, guild }) {
    const result = music.skip(guild);
    const content = result
      ? `⏭️ Skipped **${result.skipped}**.`
      : 'There is nothing playing right now.';
    return isSlash ? interaction.reply(content) : message.reply(content);
  }
};
