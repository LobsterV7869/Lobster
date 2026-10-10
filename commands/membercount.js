const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show the server member count and cached member breakdown'),
  category: 'Utility',
  async run({ guild, interaction, message }) {
    const cachedMembers = guild.members.cache;
    const cachedBots = cachedMembers.filter(member => member.user.bot).size;
    const cachedHumans = cachedMembers.filter(member => !member.user.bot).size;
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Community stats' })
      .setTitle(`${guild.name} · Members`)
      .setDescription(`This server has **${guild.memberCount.toLocaleString()} members**.`)
      .addFields(
        { name: 'Total members', value: guild.memberCount.toLocaleString(), inline: true },
        { name: 'Humans cached', value: cachedHumans.toLocaleString(), inline: true },
        { name: 'Bots cached', value: cachedBots.toLocaleString(), inline: true },
        { name: 'Server boosts', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: 'Boost level', value: `${guild.premiumTier}`, inline: true }
      )
      .setFooter({ text: 'Cached breakdown may be partial in very large servers.' })
      .setTimestamp();

    return interaction
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
