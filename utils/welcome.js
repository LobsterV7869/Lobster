const { EmbedBuilder } = require('discord.js');

function welcomeEmbed(member, settings) {
  const createdAt = Math.floor(member.user.createdTimestamp / 1000);
  const joinedAt = Math.floor(member.joinedTimestamp / 1000);
  const placeholders = {
    '{user}': `${member}`,
    '{username}': member.user.username,
    '{server}': member.guild.name,
    '{membercount}': `${member.guild.memberCount}`,
    '{created}': `<t:${createdAt}:R>`,
    '{joined}': `<t:${joinedAt}:R>`,
    '{id}': member.id
  };
  const format = value => Object.entries(placeholders)
    .reduce((text, [key, replacement]) => text.replaceAll(key, replacement), value || '')
    .slice(0, 4000);
  const validUrl = value => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };

  const embed = new EmbedBuilder()
    .setColor(0xff6b35)
    .setAuthor({
      name: `${member.guild.name} • Welcome`,
      iconURL: member.guild.iconURL() || undefined
    })
    .setTitle(`🦞 ${(settings.welcomeTitle || 'A new member has arrived!').slice(0, 250)}`)
    .setDescription(format(settings.welcomeMessage))
    .setThumbnail(validUrl(settings.welcomeThumbnail)
      ? settings.welcomeThumbnail
      : member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (validUrl(settings.welcomeImage)) embed.setImage(settings.welcomeImage);

  embed.setFooter({ text: '🦞 Lobster' });

  embed.addFields(
    { name: '👥 Members', value: `#${member.guild.memberCount.toLocaleString()}`, inline: true },
    { name: '📅 Account created', value: `<t:${createdAt}:R>`, inline: true },
    { name: '🗓️ Joined server', value: `<t:${joinedAt}:R>`, inline: true }
  );
  if (settings.welcomeServerAddress) {
    embed.addFields({
      name: '🎮 Server address',
      value: settings.welcomeServerAddress.slice(0, 1024),
      inline: false
    });
  }
  return embed;
}

module.exports = { welcomeEmbed };
