const { SlashCommandBuilder } = require('discord.js');
const { replyWithCard } = require('../canvas/send');

module.exports = {
  data: new SlashCommandBuilder().setName('giveawaycard').setDescription('Giveaway result as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction }) {
    await replyWithCard(interaction, 'event', {
      title: 'Nitro Giveaway',
      status: 'ENDED',
      hostName: interaction.user.username,
      id: interaction.id.slice(-8),
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      durationText: '1h',
      winners: ['Winner#1234'],
      entries: 42,
      serverName: interaction.guild?.name || 'Server',
    });
  },
};
