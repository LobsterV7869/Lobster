const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show the server member count and cached member breakdown'),
  category: 'Utility',
  async run({ guild, interaction, message }) {
    const total = guild.memberCount;
    const cachedBots = guild.members.cache.filter(member => member.user.bot).size;
    const cachedHumans = Math.max(0, total - cachedBots);
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Community stats' })
      .setTitle(`👥 ${guild.name} · Members`)
      .setDescription(`This server has **${total.toLocaleString()} members**.`)
      .addFields(
        { name: '🧮 Total', value: total.toLocaleString(), inline: true },
        { name: '👤 Humans', value: `${cachedHumans.toLocaleString()} (${percent(cachedHumans, total)})`, inline: true },
        { name: '🤖 Bots', value: `${cachedBots.toLocaleString()} (${percent(cachedBots, total)})`, inline: true },
        { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: '📈 Boost level', value: `Tier ${guild.premiumTier}`, inline: true }
      )
      .setFooter({ text: `${LOBSTER_FOOTER} · Cached breakdown may be partial in very large servers` })
      .setTimestamp();

    return interaction
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
