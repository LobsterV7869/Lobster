const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bancard')
    .setDescription('Ban result as canvas card')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.BanMembers],
  async run({ interaction, message }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const moderator = interaction?.user ?? message?.author;
    const mentioned = message?.mentions?.users?.first?.() || null;
    const user = interaction?.options?.getUser('user') || mentioned;

    if (!user) {
      await replyWithCard(target, 'result', {
        type: 'warning',
        title: 'User Required',
        description: 'Mention a user to use this command with the prefix, e.g. `l bancard @user`.',
        fields: [{ label: 'Moderator', value: moderator?.tag || 'Unknown' }],
      });
      return;
    }

    await replyWithCard(target, 'result', {
      type: 'success',
      title: 'User Banned',
      description: `${user.tag || user.username} has been banned from the server.`,
      fields: [
        { label: 'Moderator', value: moderator?.tag || moderator?.username || 'Unknown' },
        { label: 'Reason', value: 'Not specified' },
      ],
    });
  },
};
