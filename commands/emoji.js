const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Search and send emojis')
    .addStringOption(opt => opt.setName('name').setDescription('Emoji name').setRequired(true)),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, client }) {
    const name = isSlash ? interaction.options.getString('name') : args[0];
    if (!name) {
      const response = 'Usage: l emoji <name>';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const emoji = client.emojis.cache.find(e => e.name.toLowerCase().includes(name.toLowerCase()));

    if (!emoji) return isSlash ? interaction.reply('❌ No emoji matched that name.') : message.reply('❌ No emoji matched that name.');

    if (isSlash) await interaction.reply(`${emoji}`);
    else await message.reply(`${emoji}`);
  }
};
