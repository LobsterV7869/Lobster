const { EmbedBuilder } = require('discord.js');
const db = require('./database');

// Writes an embed to the guild's moderation log channel (falls back to the
// general audit-log channel). Mirrors the format used by index.js so all
// moderation entries look the same.
async function logModeration(guild, title, description, color = 0x5BA6FB) {
  try {
    const settings = db.getSettings(guild.id);
    if (!settings.eventLogsEnabled || settings.eventLogTypes.moderation === false) return;
    const channelId = settings.eventLogChannels.moderation || settings.auditLogChannel;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `🛡️ Moderation · ${guild.name}`, iconURL: guild.iconURL() || undefined })
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: '🦞 Lobster' })
      .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`Could not write a moderation log for guild ${guild.id}:`, error);
  }
}

module.exports = { logModeration };
