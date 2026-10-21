const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { memberHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change or reset nickname')
    .addUserOption(opt => opt.setName('member').setDescription('Member').setRequired(true))
    .addStringOption(opt => opt.setName('name').setDescription('New nickname (leave empty to reset)').setMaxLength(32)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let member, name;
    if (isSlash) {
      member = interaction.options.getMember('member');
      name = interaction.options.getString('name');
    } else {
      member = message.mentions.members.first() || guild.members.cache.get(args[0]);
      name = args.slice(1).join(' ');
    }

    if (!member) return isSlash ? interaction.reply('🏷️ Whose nickname should I change?\n`l nickname @user [name]`\n-# Leave the name empty to reset it.') : message.reply('🏷️ Whose nickname should I change?\n`l nickname @user [name]`\n-# Leave the name empty to reset it.');
    if (name?.length > 32) {
      const response = '✍️ Nicknames must be 32 characters or fewer.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const hierarchyError = memberHierarchyError(actor, member, guild);
    if (hierarchyError) return isSlash
      ? interaction.reply({ content: hierarchyError, ephemeral: true })
      : message.reply(hierarchyError);

    await member.setNickname(name || null);
    const embed = new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Nickname ${name ? `set to **${name}**` : 'reset'} for ${member}.`);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
