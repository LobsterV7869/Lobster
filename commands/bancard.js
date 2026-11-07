const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bancard')
    .setDescription('Ban result as canvas card')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.BanMembers],
  async run({ interaction }) {
    const { replyWithCard } = require('../canvas/send');
    const user = interaction.options.getUser('user');
    await replyWithCard(interaction, 'result', {
      type: 'success',
      title: 'User Banned',
      description: `${user.tag} has been banned from the server.`,
      fields: [
        { label: 'Moderator', value: interaction.user.tag },
        { label: 'Reason', value: 'Not specified' },
      ],
    });
  },
};
