const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servericon')
    .setDescription('Show server icon'),
  category: 'Utility',
  async run({ guild, interaction, message, isSlash }) {
    if (!guild.icon) return isSlash ? interaction.reply('Server has no icon') : message.reply('Server has no icon');

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} Icon`)
      .setImage(guild.iconURL({ dynamic: true, size: 512 }))
      .setColor('#0099ff');
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
