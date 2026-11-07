const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('pingcard').setDescription('Ping as canvas card'),
  category: 'Utility',
  permissions: [],
  async run({ interaction, client }) {
    const { replyWithCard } = require('../canvas/send');
    const sent = Date.now();
    await interaction.deferReply().catch(() => {});
    const latency = Date.now() - sent;
    await replyWithCard(interaction, 'info', {
      title: 'Ping',
      subtitle: 'Connection latency',
      iconType: 'clock',
      stats: [
        { label: 'Bot Latency', value: `${latency}ms` },
        { label: 'WebSocket', value: `${Math.round(client.ws.ping)}ms` },
        { label: 'Uptime', value: `${Math.floor(process.uptime() / 60)}m` },
        { label: 'Status', value: 'Online' },
      ],
      footer: 'Lobster',
    });
  },
};
