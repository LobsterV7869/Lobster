const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a member')
    .addUserOption(opt => opt.setName('target').setDescription('Member to mute').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (1-40320)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute').setMaxLength(512)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let member, duration, reason;
    if (isSlash) {
      member = interaction.options.getMember('target');
      duration = interaction.options.getInteger('duration');
      reason = interaction.options.getString('reason') || 'No reason provided';
    } else {
      member = message.mentions.members.first() || guild.members.cache.get(args[0]);
      duration = parseInt(args[1]);
      reason = args.slice(2).join(' ') || 'No reason provided';
    }

    if (!member || isNaN(duration)) {
      const response = '🔇 Who are we timing out?\n`l mute @user <minutes> [reason]`\n-# Anywhere from 1 to 40320 minutes (28 days).';
      return isSlash
        ? interaction.reply({ content: '🔇 Who are we timing out?\n`l mute @user <minutes> [reason]`\n-# Anywhere from 1 to 40320 minutes (28 days).', ephemeral: true })
        : message.reply(response);
    }
    if (reason.length > 512) {
      const response = '✍️ Keep the reason under 512 characters.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 40320) {
      const response = '⏱️ Pick a duration between 1 and 40320 minutes (28 days).';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const hierarchyError = memberHierarchyError(actor, member, guild);
    if (hierarchyError) return isSlash
      ? interaction.reply({ content: hierarchyError, ephemeral: true })
      : message.reply(hierarchyError);

    await member.timeout(duration * 60 * 1000, reason);
    const response = `Timed out ${member.user.tag} for ${duration}m.`;
    if (isSlash) await interaction.reply({ content: response });
    else await message.reply(response);
  }
};
