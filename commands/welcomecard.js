const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('welcomecard').setDescription('Welcome event as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, message, guild, user }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const mentioned = message?.mentions?.users?.first?.() || null;
    const u = interaction?.options?.getUser?.('user') || mentioned || interaction?.user || message?.author || user;
    if (!u) return;

    await replyWithCard(target, 'welcome', {
      avatarUrl: typeof u.displayAvatarURL === 'function' ? u.displayAvatarURL({ extension: 'png', size: 512 }) : null,
      username: u.username || 'Member',
      serverName: g?.name || 'Server',
      memberCount: g?.memberCount ?? 0,
      type: 'join',
    });
  },
};
