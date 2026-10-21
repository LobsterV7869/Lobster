const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set channel slowmode')
    .addIntegerOption(opt => opt.setName('seconds').setDescription('Slowmode in seconds (0-21600)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async run({ interaction, message, isSlash, args, channel }) {
    const seconds = isSlash ? interaction.options.getInteger('seconds') : parseInt(args[0]);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      const response = '🐌 Slowmode must be between 0 and 21600 seconds (6 hours).';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    await channel.setRateLimitPerUser(seconds);
    const embed = new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Slowmode set to **${seconds}s**.`);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
