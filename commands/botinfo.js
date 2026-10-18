const { SlashCommandBuilder, EmbedBuilder, version: discordVersion } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

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
    const members = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Bot information', iconURL: client.user.displayAvatarURL() })
      .setTitle(`🦞 ${client.user.username}`)
      .setDescription('A public Discord bot for server setup, moderation, support, and community tools.')
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🌐 Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
        { name: '👥 Members', value: members.toLocaleString(), inline: true },
        { name: '🧩 Commands', value: client.commands.size.toLocaleString(), inline: true },
        { name: '⏱️ Uptime', value: uptime, inline: true },
        { name: '📡 Gateway', value: `${Math.max(0, client.ws.ping)} ms`, inline: true },
        { name: '📚 Library', value: `discord.js v${discordVersion}`, inline: true }
      )
      .setFooter({ text: `${LOBSTER_FOOTER} · Use /help to browse commands` })
      .setTimestamp();

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
