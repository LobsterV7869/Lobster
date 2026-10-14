const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(opt => opt.setName('id').setDescription('User ID to unban').setRequired(true)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  async run({ interaction, message, isSlash, args, guild }) {
    const id = isSlash ? interaction.options.getString('id') : args[0];

    if (!id) return isSlash ? interaction.reply('❌ Please provide a user ID to unban.') : message.reply('❌ Please provide a user ID to unban.');
    if (!/^\d{17,20}$/.test(id)) {
      const response = 'Provide a valid Discord user ID.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    await guild.members.unban(id);
    const embed = new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Unbanned user with ID **${id}**.`);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
