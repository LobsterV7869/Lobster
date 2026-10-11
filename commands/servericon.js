const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servericon')
    .setDescription('Show server icon'),
  category: 'Utility',
  async run({ guild, interaction, message, isSlash }) {
    if (!guild.icon) return isSlash ? interaction.reply('Server has no icon') : message.reply('Server has no icon');

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Server icon', iconURL: guild.iconURL() })
      .setTitle(`🖼️ ${guild.name}`)
      .setImage(guild.iconURL({ dynamic: true, size: 512 }))
      .setFooter({ text: LOBSTER_FOOTER })
      .setTimestamp();

    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
