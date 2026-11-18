const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder().setName('rankcard').setDescription('Rank as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, message, guild, user }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const mentioned = message?.mentions?.users?.first?.() || null;
    const u = interaction?.options?.getUser?.('user') || mentioned || interaction?.user || message?.author || user;
    if (!u || !g) return;

    const data = (db.getUser ? db.getUser(g.g.id || g.id, u.id) : null) || {};
    // normalize guild id access
    const gid = g?.id;
    const record = (db.getUser && gid ? db.getUser(gid, u.id) : data) || {};
    const level = record.level || 0;
    const xp = record.xp || 0;
    const xpNeeded = (level + 1) * 100;
    await replyWithCard(target, 'profile', {
      avatarUrl: typeof u.displayAvatarURL === 'function' ? u.displayAvatarURL({ extension: 'png', size: 512 }) : null,
      username: u.username || 'User',
      tag: u.discriminator && u.discriminator !== '0' ? `#${u.discriminator}` : '',
      badges: ['Member'],
      level,
      xp,
      xpNeeded,
      rank: '—',
      stats: [
        { label: 'Messages', value: String(record.messages || 0) },
        { label: 'Voice', value: String(record.voiceTime || 0) },
        { label: 'Level', value: String(level) },
      ],
    });
  },
};
