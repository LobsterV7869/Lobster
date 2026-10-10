const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show this server’s top chat levels'),
  category: 'Community',
  async run({ interaction, message, isSlash, guild }) {
    const leaders = db.getLeaderboard(guild.id, 10);
    const description = leaders.length
      ? leaders.map(entry =>
        `**${entry.rank}.** <@${entry.userId}> — Level **${entry.level}** · ${entry.xp.toLocaleString()} XP`
      ).join('\n')
      : 'No one has earned XP yet. Start chatting to claim the top spot!';
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${guild.name} · Level leaderboard`)
      .setDescription(description)
      .setFooter({ text: 'Earn XP by chatting once per minute.' });
    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
