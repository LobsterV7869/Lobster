const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('giveawaycard').setDescription('Giveaway result as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, message, guild }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const host = interaction?.user ?? message?.author;
    const now = Date.now();
    await replyWithCard(target, 'event', {
      title: 'Nitro Giveaway',
      status: 'ENDED',
      hostName: host?.username || 'Host',
      id: String(interaction?.id || message?.id || '').slice(-8) || 'demo',
      startedAt: now - 3600000,
      endedAt: now,
      durationText: '1h',
      winners: ['Winner#1234'],
      entries: 42,
      serverName: g?.name || 'Server',
    });
  },
};
