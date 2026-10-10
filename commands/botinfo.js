const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show public information about Lobster'),
  category: 'Utility',
  async run({ client, interaction, message, isSlash }) {
    const uptimeSeconds = Math.floor((client.uptime || 0) / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptime = [
      days ? `${days}d` : null,
      hours ? `${hours}h` : null,
      `${minutes}m`
    ].filter(Boolean).join(' ');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: 'Lobster · Bot information', iconURL: client.user.displayAvatarURL() })
      .setDescription('A public Discord bot for server setup, moderation, support, and community tools.')
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Library', value: 'Discord.js v14', inline: true }
      )
      .setFooter({ text: 'Use /help to browse commands · /ping to check latency' })
      .setTimestamp();
    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
