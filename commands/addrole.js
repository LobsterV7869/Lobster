const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { roleHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Give a role to a member')
    .addUserOption(opt => opt.setName('member').setDescription('Member to give role to').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let member, role;
    if (isSlash) {
      member = interaction.options.getMember('member');
      role = interaction.options.getRole('role');
    } else {
      member = message.mentions.members.first() || guild.members.cache.get(args[0]);
      role = message.mentions.roles.first() || guild.roles.cache.get(args[1]);
    }

    if (!member || !role) return isSlash ? interaction.reply('➕ Who gets the role?\n`l addrole @user @role`\n-# Mention the member, then the role.') : message.reply('➕ Who gets the role?\n`l addrole @user @role`\n-# Mention the member, then the role.');
    const targetError = roleHierarchyError(actor, role, guild);
    if (targetError) return isSlash ? interaction.reply({ content: targetError, ephemeral: true }) : message.reply(targetError);

    await member.roles.add(role);
    const embed = new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Added ${role} to ${member}.`);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
