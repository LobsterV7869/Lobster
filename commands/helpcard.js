const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('helpcard').setDescription('Help as canvas card'),
  category: 'Utility',
  permissions: [],
  async run({ client, interaction, message }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const c = interaction?.client ?? message?.client ?? client;
    const commands = c?.commands ? Array.from(c.commands.values()) : [];
    const items = commands.slice(0, 10).map(cmd => ({
      name: `/${cmd?.data?.name || 'command'}`,
      description: cmd?.data?.description || '',
    }));
    await replyWithCard(target, 'list', {
      title: 'Commands',
      items: items.length ? items : [{ name: '/help', description: 'No commands loaded.' }],
      page: 1,
      totalPages: 1,
      iconType: 'info',
    });
  },
};
