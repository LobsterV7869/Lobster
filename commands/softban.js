const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');
const { logModeration } = require('../utils/modlog');

const SEVEN_DAYS = 7 * 24 * 60 * 60;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban then immediately unban a member to wipe their recent messages')
    .addUserOption(option => option.setName('target').setDescription('User to softban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the softban').setMaxLength(512)),
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
      const response = '🧤 Who are we softbanning?\n`l softban @user [reason]`\n-# Kicks them and sweeps away the last 7 days of messages.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (user.id === moderator.id || user.id === guild.ownerId) {
      const response = '🙅 I cannot softban you or the server owner.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const target = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
    if (target) {
      const hierarchyError = memberHierarchyError(actor, target, guild);
      if (hierarchyError) {
        return isSlash ? interaction.reply({ content: hierarchyError, ephemeral: true }) : message.reply(hierarchyError);
      }
    }

    await guild.members.ban(user, { reason: `Softban · ${reason}`, deleteMessageSeconds: SEVEN_DAYS });
    await guild.members.unban(user.id, 'Softban release').catch(() => {});

    logModeration(
      guild,
      'Member softbanned',
      `**${user.tag}** (${user}) was softbanned by ${moderator}.\n**Reason:** ${reason}`
    );

    const response = `Softbanned ${user.tag} (messages from the last 7 days removed).`;
    return isSlash ? interaction.reply({ content: response }) : message.reply(response);
  }
};
