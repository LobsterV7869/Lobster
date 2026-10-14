const { SlashCommandBuilder } = require('discord.js');
const music = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Change the playback volume (0-200%)')
    .addIntegerOption(option => option
      .setName('percent')
      .setDescription('Volume from 0 to 200')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(200)),
  category: 'Music',
  async run({ interaction, message, isSlash, guild, args }) {
    const value = isSlash ? interaction.options.getInteger('percent') : Number.parseInt(args[0], 10);
    if (!Number.isInteger(value) || value < 0 || value > 200) {
      const content = 'Give me a volume between **0** and **200**.';
      return isSlash ? interaction.reply(content) : message.reply(content);
    }

    const applied = music.setVolume(guild, value / 100);
    const content = applied === null
      ? 'There is nothing playing right now.'
      : `🔊 Volume set to **${value}%**.`;
    return isSlash ? interaction.reply(content) : message.reply(content);
  }
};
