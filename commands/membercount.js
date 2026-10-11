const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

async function countBots(guild) {
  try {
    if (guild.members.cache.size < guild.memberCount) {
      await Promise.race([
        guild.members.fetch(),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
    }
  } catch {
    // Fall back to whatever is cached if the member list cannot be fetched in time.
  }
  return guild.members.cache.filter(member => member.user.bot).size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show the server member count and member breakdown'),
  category: 'Utility',
  async run({ guild, interaction, message, isSlash }) {
    if (isSlash && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    const total = guild.memberCount;
    const bots = await countBots(guild);
    const humans = Math.max(0, total - bots);
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Community stats' })
      .setTitle(`👥 ${guild.name} · Members`)
      .setDescription(`This server has **${total.toLocaleString()} members**.`)
      .addFields(
        { name: '🧮 Total', value: total.toLocaleString(), inline: true },
        { name: '👤 Humans', value: `${humans.toLocaleString()} (${percent(humans, total)})`, inline: true },
        { name: '🤖 Bots', value: `${bots.toLocaleString()} (${percent(bots, total)})`, inline: true },
        { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: '📈 Boost level', value: `Tier ${guild.premiumTier}`, inline: true }
      )
      .setFooter({ text: `${LOBSTER_FOOTER}` })
      .setTimestamp();

    return isSlash
      ? interaction.editReply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
