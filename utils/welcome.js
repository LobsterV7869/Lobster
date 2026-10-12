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
      name: `👋 Welcome to ${member.guild.name}`,
      iconURL: member.guild.iconURL() || undefined
    })
    .setTitle(format(settings.welcomeTitle) || `👋 Welcome, ${member.user.username}!`)
    .setDescription(format(settings.welcomeMessage)
      || `Hey ${member}, welcome to **${member.guild.name}**! You are our **${ordinal(memberCount)}** member.`)
    .setThumbnail(validUrl(settings.welcomeThumbnail)
      ? settings.welcomeThumbnail
      : member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Member', value: `${member}`, inline: true },
      { name: '🔢 Join position', value: `#${memberCount.toLocaleString()} (${ordinal(memberCount)})`, inline: true },
      { name: '🕒 Account age', value: `<t:${createdAt}:R>`, inline: true },
      { name: '📅 Account created', value: `<t:${createdAt}:D>`, inline: true },
      { name: '📥 Joined server', value: `<t:${joinedAt}:D>`, inline: true }
    )
    .setFooter({ text: format(settings.welcomeFooter) || '🦞 Lobster' })
    .setTimestamp();

  if (validUrl(settings.welcomeImage)) embed.setImage(settings.welcomeImage);

  if (Date.now() - member.user.createdTimestamp < 7 * 86400000) {
    embed.addFields({ name: '⚠️ New account', value: 'This account is less than 7 days old.', inline: false });
  }
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
