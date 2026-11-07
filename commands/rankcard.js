const { SlashCommandBuilder } = require('discord.js');
const { replyWithCard } = require('../canvas/send');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder().setName('rankcard').setDescription('Rank as canvas card'),
  category: 'Fun',
  permissions: [],
  async run({ interaction, guild, user }) {
    const data = db.getUser(guild.id, user.id) || {};
    const level = data.level || 0;
    const xp = data.xp || 0;
    const xpNeeded = (level + 1) * 100;
    await replyWithCard(interaction, 'profile', {
      avatarUrl: user.displayAvatarURL({ extension: 'png', size: 512 }),
      username: user.username,
      tag: user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '',
      badges: ['Member'],
      level,
      xp,
      xpNeeded,
      rank: '—',
      stats: [
        { label: 'Messages', value: String(data.messages || 0) },
        { label: 'Voice', value: String(data.voiceTime || 0) },
        { label: 'Level', value: String(level) },
      ],
    });
  },
};
