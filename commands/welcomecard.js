const { SlashCommandBuilder } = require('discord.js');
const { replyWithCard } = require('../canvas/send');

module.exports = {
  data: new SlashCommandBuilder().setName('welcomecard').setDescription('Welcome event as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, guild }) {
    await replyWithCard(interaction, 'welcome', {
      avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 512 }),
      username: interaction.user.username,
      serverName: guild?.name || 'Server',
      memberCount: guild?.memberCount || 0,
      type: 'join',
    });
  },
};
