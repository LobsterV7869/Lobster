const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(opt => opt.setName('target').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban').setMaxLength(512)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor, user: moderator }) {
    let user, reason;
    if (isSlash) {
      user = interaction.options.getUser('target');
      reason = interaction.options.getString('reason') || 'No reason provided';
    } else {
      user = message.mentions.users.first() || (args[0] ? await guild.client.users.fetch(args[0]).catch(() => null) : null);
      reason = args.slice(1).join(' ') || 'No reason provided';
    }

    if (!user) {
      const response = '🔨 Who are we banning?\n`l ban @user [reason]`\n-# Name the member, plus a reason if you want it logged.';
      return isSlash
        ? interaction.reply({ content: '🔨 Who are we banning?\n`l ban @user [reason]`\n-# Name the member, plus a reason if you want it logged.', ephemeral: true })
        : message.reply(response);
    }
    if (reason.length > 512) {
      const response = '✍️ Keep the reason under 512 characters.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (user.id === moderator.id || user.id === guild.ownerId) {
      const response = '🙅 I cannot ban you or the server owner — pick someone else.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const targetMember = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
    if (targetMember) {
      const hierarchyError = memberHierarchyError(actor, targetMember, guild);
      if (hierarchyError) return isSlash
        ? interaction.reply({ content: hierarchyError, ephemeral: true })
        : message.reply(hierarchyError);
    }

    await guild.members.ban(user, { reason });
    const response = `Banned ${user.tag}.`;
    if (isSlash) await interaction.reply({ content: response });
    else await message.reply(response);
  }
};
