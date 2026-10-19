const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { memberHierarchyError } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const { logModeration } = require('../utils/modlog');

const MAX_DURATION = 365 * 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a member and unban them automatically when time is up')
    .addUserOption(option => option.setName('target').setDescription('User to ban').setRequired(true))
    .addStringOption(option => option.setName('duration').setDescription('Duration, e.g. 10m, 2h, 7d').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setMaxLength(512)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor, user: moderator }) {
    let user, durationInput, reason;
    if (isSlash) {
      user = interaction.options.getUser('target');
      durationInput = interaction.options.getString('duration');
      reason = interaction.options.getString('reason') || 'No reason provided';
    } else {
      user = message.mentions.users.first() || (args[0] ? await guild.client.users.fetch(args[0]).catch(() => null) : null);
      durationInput = args[1];
      reason = args.slice(2).join(' ') || 'No reason provided';
    }

    if (!user || !durationInput) {
      const response = 'Usage: tempban <@user> <duration> [reason]';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (user.id === moderator.id || user.id === guild.ownerId) {
      const response = 'You cannot tempban yourself or the server owner.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const duration = parseDuration(durationInput);
    if (!duration || duration > MAX_DURATION) {
      const response = 'Give a duration between 1 minute and 365 days (e.g. `10m`, `2h`, `7d`).';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const target = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
    if (target) {
      const hierarchyError = memberHierarchyError(actor, target, guild);
      if (hierarchyError) {
        return isSlash ? interaction.reply({ content: hierarchyError, ephemeral: true }) : message.reply(hierarchyError);
      }
    }

    const expiresAt = Date.now() + duration;
    await guild.members.ban(user, { reason: `Tempban (${formatDuration(duration)}) · ${reason}` });
    db.addTempBan(guild.id, user.id, expiresAt, moderator.id, reason);

    logModeration(
      guild,
      'Member temporarily banned',
      `**${user.tag}** (${user}) was banned by ${moderator} for **${formatDuration(duration)}**.\n**Reason:** ${reason}\n**Expires:** <t:${Math.floor(expiresAt / 1000)}:F>`
    );

    const response = `Temporarily banned ${user.tag} for ${formatDuration(duration)}.`;
    return isSlash ? interaction.reply({ content: response }) : message.reply(response);
  }
};
