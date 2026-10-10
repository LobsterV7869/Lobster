const { EmbedBuilder } = require('discord.js');

function farewellEmbed(member, settings) {
  const placeholders = {
    '{user}': `${member}`,
    '{username}': member.user.username,
    '{server}': member.guild.name,
    '{membercount}': `${member.guild.memberCount}`,
    '{created}': `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    '{joined}': member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      : 'unknown',
    '{id}': member.id
  };
  const description = Object.entries(placeholders)
    .reduce((text, [key, value]) => text.replaceAll(key, value), settings.farewellMessage || '')
    .slice(0, 4000);
  const embed = new EmbedBuilder()
    .setColor(0xff6b35)
    .setAuthor({
      name: `${member.guild.name} • Goodbye`,
      iconURL: member.guild.iconURL() || undefined
    })
    .setTitle('🦞 A member has left')
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields({ name: '👥 Members', value: `#${member.guild.memberCount.toLocaleString()}`, inline: true })
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
