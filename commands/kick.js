const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(opt => opt.setName('target').setDescription('User to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick').setMaxLength(512)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let member, reason;
    if (isSlash) {
      member = interaction.options.getMember('target');
      reason = interaction.options.getString('reason') || 'No reason provided';
    } else {
      member = message.mentions.members.first() || guild.members.cache.get(args[0]);
      reason = args.slice(1).join(' ') || 'No reason provided';
    }

    if (!member) {
      const response = 'Usage: l kick @user [reason]';
      return isSlash
        ? interaction.reply({ content: 'Member not found.', ephemeral: true })
        : message.reply(response);
    }
    if (reason.length > 512) {
      const response = 'The kick reason must be 512 characters or fewer.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const hierarchyError = memberHierarchyError(actor, member, guild);
    if (hierarchyError) return isSlash
      ? interaction.reply({ content: hierarchyError, ephemeral: true })
      : message.reply(hierarchyError);

    await member.kick(reason);
    const response = `Kicked ${member.user.tag}.`;
    if (isSlash) await interaction.reply({ content: response });
    else await message.reply(response);
  }
};
