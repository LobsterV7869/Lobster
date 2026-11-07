const { SlashCommandBuilder } = require('discord.js');
const { replyWithCard } = require('../canvas/send');

module.exports = {
  data: new SlashCommandBuilder().setName('helpcard').setDescription('Help as canvas card'),
  category: 'Utility',
  permissions: [],
  async run({ interaction, client }) {
    const items = Array.from(client.commands.values()).slice(0, 10).map(c => ({
      name: `/${c.data.name}`,
      description: c.data.description || '',
    }));
    await replyWithCard(interaction, 'list', {
      title: 'Commands',
      items,
      page: 1,
      totalPages: 1,
      iconType: 'info',
    });
  },
};
