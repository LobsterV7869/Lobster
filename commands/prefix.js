const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('View or change this server’s command prefix')
    .addStringOption(opt => opt.setName('new_prefix').setDescription('New prefix (up to 5 characters)')),
  category: 'Utility',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild }) {
    const newPrefix = isSlash ? interaction.options.getString('new_prefix') : args.join(' ');
    if (!newPrefix) {
      const currentPrefix = db.getSettings(guild.id).prefix || 'l';
      return isSlash
        ? interaction.reply({ content: `This server's prefix is \`${currentPrefix}\`.`, ephemeral: true })
        : message.reply(`This server's prefix is \`${currentPrefix}\`.`);
    }
    if (newPrefix.length > 5 || /\s/.test(newPrefix)) {
      return isSlash
        ? interaction.reply({ content: 'The prefix must be 1–5 characters with no spaces.', ephemeral: true })
        : message.reply('The prefix must be 1–5 characters with no spaces.');
    }

    db.updateSetting(guild.id, 'prefix', newPrefix);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`✅ Prefix updated to \`${newPrefix}\`.`);
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
