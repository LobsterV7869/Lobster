const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status')
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for being AFK').setMaxLength(500)),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, user, guild }) {
    const reason = isSlash ? interaction.options.getString('reason') || 'No reason' : args.join(' ') || 'No reason';
    if (reason.length > 500) {
      const response = 'Your AFK reason must be 500 characters or fewer.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    db.setAFK(user.id, guild.id, reason, Date.now());

    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setDescription(`💤 I have set your AFK: **${reason}**`);
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
