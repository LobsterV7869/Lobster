const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfocard')
    .setDescription('User info as canvas card')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  category: 'Utility',
  permissions: [],
  async run({ interaction, guild }) {
    const { replyWithCard } = require('../canvas/send');
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await guild.members.fetch(user.id).catch(() => null);
    const roles = member ? member.roles.cache.size - 1 : 0;
    await replyWithCard(interaction, 'info', {
      title: user.tag,
      subtitle: member?.joinedAt ? `Joined ${member.joinedAt.toDateString()}` : 'User Information',
      iconType: 'user',
      stats: [
        { label: 'ID', value: user.id.slice(-12) },
        { label: 'Account Created', value: user.createdAt.toDateString() },
        { label: 'Roles', value: String(roles) },
        { label: 'Bot', value: user.bot ? 'Yes' : 'No' },
      ],
    });
  },
};
