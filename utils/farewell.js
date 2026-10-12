const { EmbedBuilder } = require('discord.js');

function hexToInt(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^#?([\da-f]{6})$/i);
  return match ? parseInt(match[1], 16) : fallback;
}

function farewellEmbed(member, settings) {
  const createdAt = Math.floor(member.user.createdTimestamp / 1000);
  const placeholders = {
    '{user}': `${member}`,
    '{username}': member.user.username,
    '{tag}': member.user.tag,
    '{server}': member.guild.name,
    '{membercount}': `${member.guild.memberCount}`,
    '{created}': `<t:${createdAt}:R>`,
    '{joined}': member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      : 'unknown',
    '{id}': member.id
  };
  const description = (Object.entries(placeholders)
    .reduce((text, [key, value]) => text.replaceAll(key, value), settings.farewellMessage || '')
    .slice(0, 4000)) || `**${member.user.username}** has left **${member.guild.name}**.`;
  const embed = new EmbedBuilder()
    .setColor(hexToInt(settings.welcomeColor, 0xff6b35))
    .setAuthor({
      name: `👋 Goodbye from ${member.guild.name}`,
      iconURL: member.guild.iconURL() || undefined
    })
    .setTitle(`👋 ${member.user.username} has left`)
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Member', value: `${member.user.username}`, inline: true },
      { name: '👥 Members now', value: `#${member.guild.memberCount.toLocaleString()}`, inline: true }
    )
    .setFooter({ text: '🦞 Lobster' })
    .setTimestamp();
  if (settings.welcomeImage) {
    try {
      if (['http:', 'https:'].includes(new URL(settings.welcomeImage).protocol)) {
        embed.setImage(settings.welcomeImage);
      }
    } catch {
    }
  }
  return embed;
}

module.exports = { farewellEmbed };

