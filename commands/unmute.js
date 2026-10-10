const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout')
    .addUserOption(opt => opt.setName('target').setDescription('Member to unmute').setRequired(true)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let member;
    if (isSlash) member = interaction.options.getMember('target');
    else member = message.mentions.members.first() || guild.members.cache.get(args[0]);

    if (!member) return isSlash ? interaction.reply('Member not found') : message.reply('Member not found');
    const hierarchyError = memberHierarchyError(actor, member, guild);
    if (hierarchyError) return isSlash
      ? interaction.reply({ content: hierarchyError, ephemeral: true })
      : message.reply(hierarchyError);

    await member.timeout(null);
    const embed = new EmbedBuilder().setColor('#00ff00').setDescription(`✅ Removed timeout for **${member.user.tag}**`);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
