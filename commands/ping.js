const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check Lobster’s response and Discord gateway latency'),
  category: 'Utility',
  async run({ client, interaction, message, isSlash }) {
    const startedAt = Date.now();
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({
        name: 'Lobster · Ping check',
        iconURL: client.user.displayAvatarURL()
      })
      .addFields(
        { name: '⚡ Bot latency', value: 'Measuring…', inline: true },
        { name: '📡 Discord gateway', value: 'Measuring…', inline: true }
      )
      .setFooter({ text: `${LOBSTER_FOOTER} · Response and gateway round-trip time` })
      .setTimestamp();

    if (isSlash) {
      const response = await interaction.reply({ embeds: [embed], fetchReply: true });
      embed.spliceFields(0, 2,
        { name: '⚡ Bot latency', value: `${Math.max(0, Date.now() - startedAt)} ms`, inline: true },
        { name: '📡 Discord gateway', value: `${Math.max(0, Math.round(client.ws.ping))} ms`, inline: true }
      );
      return response.edit({ embeds: [embed] });
    }

    const response = await message.reply({ embeds: [embed] });
    embed.spliceFields(0, 2,
      { name: '⚡ Bot latency', value: `${Math.max(0, Date.now() - startedAt)} ms`, inline: true },
      { name: '📡 Discord gateway', value: `${Math.max(0, Math.round(client.ws.ping))} ms`, inline: true }
    );
    return response.edit({ embeds: [embed] });
  }
};
