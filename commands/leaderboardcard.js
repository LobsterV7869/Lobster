const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboardcard').setDescription('Leaderboard as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ client, interaction, message, guild }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const c = interaction?.client ?? message?.client ?? client;
    const requester = interaction?.user ?? message?.author;
    const gid = g?.id;
    const top = (db.getTopUsers && gid) ? db.getTopUsers(gid, 10) : [];
    const entries = (Array.isArray(top) && top.length ? top : Array.from({ length: 5 }, (_, i) => ({ userId: `x${i}`, username: `User ${i + 1}`, xp: (5 - i) * 100 }))).map((u, i) => ({
      rank: i + 1,
      avatarUrl: c?.users?.cache?.get(u.userId)?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null,
      name: u.username || u.name || String(u.userId || 'Unknown'),
      value: u.xp || u.value || 0,
      userId: u.userId,
    }));
    await replyWithCard(target, 'leaderboard', {
      title: 'Leaderboard',
      entries,
      highlightUserId: requester?.id,
      page: 1,
      totalPages: 1,
    });
  },
};
