const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('View your or another member’s level')
    .addUserOption(option => option.setName('member').setDescription('Member to check')),
  category: 'Community',
  async run({ interaction, message, isSlash, args, guild, user: author }) {
    const target = isSlash
      ? interaction.options.getUser('member') || author
      : message.mentions.users.first() || (args[0] ? await guild.client.users.fetch(args[0]).catch(() => null) : author);
    if (!target) {
      const response = '📈 Whose level should I show?\n`l level [@user]`\n-# No mention? I will show yours.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const stats = db.getLevel(guild.id, target.id);
    const rank = stats.xp ? db.getLevelRank(guild.id, target.id) : null;
    const progressFilled = Math.floor((stats.progress / stats.needed) * 12);
    const progressBar = `${'▰'.repeat(progressFilled)}${'▱'.repeat(12 - progressFilled)}`;
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setAuthor({ name: `${target.username}’s level`, iconURL: target.displayAvatarURL() })
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Level', value: `${stats.level}`, inline: true },
        { name: 'Server rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
        { name: 'Total XP', value: stats.xp.toLocaleString(), inline: true },
        { name: 'Progress to next level', value: `${progressBar}\n${stats.progress} / ${stats.needed} XP`, inline: false }
      );
    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
