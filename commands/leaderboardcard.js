const { SlashCommandBuilder } = require('discord.js');
const { replyWithCard } = require('../canvas/send');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboardcard').setDescription('Leaderboard as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, guild }) {
    const top = db.getTopUsers ? db.getTopUsers(guild.id, 10) : [];
    const entries = (top.length ? top : Array.from({length:5}, (_,i)=>({userId:`x${i}`, username:`User${i+1}`, xp:(5-i)*100}))).map((u,i)=>({
      rank: i+1,
      avatarUrl: interaction.client.users.cache.get(u.userId)?.displayAvatarURL({extension:'png',size:256}),
      name: u.username || u.userId,
      value: u.xp || 0,
      userId: u.userId,
    }));
    await replyWithCard(interaction, 'leaderboard', {
      title: 'Leaderboard',
      entries,
      highlightUserId: interaction.user.id,
      page: 1,
      totalPages: 1,
    });
  },
};
