const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfocard')
    .setDescription('User info as canvas card')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  category: 'Utility',
  permissions: [],
  async run({ interaction, message, guild }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const mentioned = message?.mentions?.users?.first?.() || null;
    const user = interaction?.options?.getUser('user') || mentioned || interaction?.user || message?.author;
    if (!user) return;

    const member = g?.members?.fetch ? await g.members.fetch(user.id).catch(() => null) : null;
    const roles = member ? Math.max(0, member.roles.cache.size - 1) : 0;
    const joined = member?.joinedAt ? member.joinedAt.toDateString() : null;
    const created = user.createdAt ? user.createdAt.toDateString() : 'Unknown';
    await replyWithCard(target, 'info', {
      title: user.tag || user.username || 'User',
      subtitle: joined ? `Joined ${joined}` : 'User Information',
      iconType: 'user',
      stats: [
        { label: 'ID', value: String(user.id || '').slice(-12) || '—' },
        { label: 'Account Created', value: created },
        { label: 'Roles', value: String(roles) },
        { label: 'Bot', value: user.bot ? 'Yes' : 'No' },
      ],
    });
  },
};
