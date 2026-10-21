const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');
const { memberHierarchyError } = require('../utils/moderation');
const { logModeration } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member and record it on their record')
    .addUserOption(option => option.setName('target').setDescription('Member to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the warning').setMaxLength(512)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor, user: moderator }) {
    let member, reason;
    if (isSlash) {
      member = interaction.options.getMember('target');
      reason = interaction.options.getString('reason') || 'No reason provided';
    } else {
      member = message.mentions.members.first() || guild.members.cache.get(args[0]);
      reason = args.slice(1).join(' ') || 'No reason provided';
    }

    if (!member) {
      const response = '⚠️ Who deserves a warning?\n`l warn @user [reason]`\n-# Warnings stack, so you always keep score.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const hierarchyError = memberHierarchyError(actor, member, guild);
    if (hierarchyError) {
      return isSlash
        ? interaction.reply({ content: hierarchyError, ephemeral: true })
        : message.reply(hierarchyError);
    }

    const warning = db.addWarning(guild.id, member.id, moderator.id, reason);
    const total = db.getWarnings(guild.id, member.id).length;

    member.send(`⚠️ You were warned in **${guild.name}**.\n**Reason:** ${reason}`).catch(() => {});

    logModeration(
      guild,
      'Member warned',
      `**${member.user.tag}** (${member}) was warned by ${moderator}.\n**Reason:** ${reason}\n**Warning:** #${warning.id} · **Total:** ${total}`
    );

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Moderation', iconURL: member.user.displayAvatarURL() })
      .setDescription(`⚠️ **${member.user.tag}** has been warned.`)
      .addFields(
        { name: 'Reason', value: reason, inline: false },
        { name: 'Warning ID', value: `\`#${warning.id}\``, inline: true },
        { name: 'Total warnings', value: `\`${total}\``, inline: true }
      )
      .setFooter({ text: LOBSTER_FOOTER })
      .setTimestamp();

    return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
  }
};
