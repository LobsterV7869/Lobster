const { EmbedBuilder } = require('discord.js');

function hexToInt(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^#?([\da-f]{6})$/i);
  return match ? parseInt(match[1], 16) : fallback;
}

function ordinal(number) {
  const remainder100 = number % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${number}th`;
  switch (number % 10) {
    case 1: return `${number}st`;
    case 2: return `${number}nd`;
    case 3: return `${number}rd`;
    default: return `${number}th`;
  }
}

function welcomeEmbed(member, settings) {
  const createdAt = Math.floor(member.user.createdTimestamp / 1000);
  const joinedAt = member.joinedTimestamp
    ? Math.floor(member.joinedTimestamp / 1000)
    : Math.floor(Date.now() / 1000);
  const memberCount = member.guild.memberCount;
  const placeholders = {
    '{user}': `${member}`,
    '{username}': member.user.username,
    '{tag}': member.user.tag,
    '{server}': member.guild.name,
    '{membercount}': `${memberCount}`,
    '{ordinal}': ordinal(memberCount),
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
    .setColor(hexToInt(settings.welcomeColor, 0xff6b35))
    .setAuthor({
      name: `🎉 Welcome To Server`,
      iconURL: member.guild.iconURL() || undefined
    })
    .setDescription(format(settings.welcomeMessage) || `${member} welcome to our server! Feel free to chat and join in.`)
    .setThumbnail(validUrl(settings.welcomeThumbnail)
      ? settings.welcomeThumbnail
      : member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 User', value: `${member}`, inline: true },
      { name: '📅 Account Created', value: `<t:${createdAt}:R>`, inline: true },
      { name: '🔢 Server Member Count', value: `${memberCount}`, inline: true },
      { name: '💌 Invited By', value: 'Unknown', inline: true }
    )
    .setFooter({ text: format(settings.welcomeFooter) || '🦞 Lobster' })
    .setTimestamp();

  if (validUrl(settings.welcomeImage)) embed.setImage(settings.welcomeImage);
  else embed.setImage('https://cdn.discordapp.com/attachments/1554182268644499456/1560382967396696194/welcome.jpg');



  return embed;
}

module.exports = { welcomeEmbed };
