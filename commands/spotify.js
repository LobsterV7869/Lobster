const { SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

const BAR_LENGTH = 16;

function spotifyActivity(member) {
  const activities = member?.presence?.activities || [];
  return activities.find(activity =>
    activity.type === ActivityType.Listening && activity.name === 'Spotify'
  ) || null;
}

function coverURL(activity) {
  const image = activity.assets?.largeImage;
  if (!image) return null;
  const id = image.startsWith('spotify:image:') ? image.slice('spotify:image:'.length) : image;
  return `https://i.scdn.co/image/${id}`;
}

function clock(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function progressBar(elapsed, total) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
  const filled = Math.round(ratio * BAR_LENGTH);
  return '▬'.repeat(filled) + '🔘' + '▬'.repeat(Math.max(0, BAR_LENGTH - filled));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Show the Spotify track a member is listening to right now')
    .addUserOption(option => option.setName('target').setDescription('Member to check').setRequired(false)),
  aliases: ['spo', 'sp'],
  category: 'Music',
  async run({ interaction, message, isSlash, args, guild, client }) {
    let user;
    if (isSlash) {
      user = interaction.options.getUser('target') || interaction.user;
    } else {
      user = message.mentions.users.first()
        || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : message.author);
    }

    if (!user) {
      const response = '🎧 Whose music should I show?\n`l spotify [@user]`\n-# They need Spotify connected to their profile.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const member = guild.members.cache.get(user.id)
      || await guild.members.fetch(user.id).catch(() => null);
    const activity = spotifyActivity(member);

    if (!activity) {
      const embed = new EmbedBuilder()
        .setColor(LOBSTER_BLUE)
        .setAuthor({ name: `${user.username} · Spotify`, iconURL: user.displayAvatarURL() })
        .setDescription(`🎧 **${member?.displayName || user.username}** is not listening to Spotify right now.`)
        .setFooter({ text: LOBSTER_FOOTER });
      return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
    }

    const song = activity.details || activity.name;
    const artists = activity.state || 'Unknown artist';
    const album = activity.assets?.largeText || null;
    const start = activity.timestamps?.start ? activity.timestamps.start.getTime() : null;
    const end = activity.timestamps?.end ? activity.timestamps.end.getTime() : null;
    const trackURL = activity.syncId ? `https://open.spotify.com/track/${activity.syncId}` : null;

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: `${member?.displayName || user.username} · Spotify`, iconURL: user.displayAvatarURL() })
      .setTitle(`🎧 ${song}`)
      .setDescription(`by **${artists}**`)
      .setFooter({ text: `${LOBSTER_FOOTER}${album ? ` · ${album}` : ''}` })
      .setTimestamp();

    if (trackURL) embed.setURL(trackURL);
    const cover = coverURL(activity);
    if (cover) embed.setThumbnail(cover);
    if (album) embed.addFields({ name: '💿 Album', value: album, inline: true });
    if (start && end) {
      const elapsed = Date.now() - start;
      embed.addFields({
        name: '⏱️ Progress',
        value: `${progressBar(elapsed, end - start)}\n\`${clock(elapsed)} / ${clock(end - start)}\``,
        inline: false
      });
    }
    if (trackURL) embed.addFields({ name: '🔗 Track', value: `[Open in Spotify](${trackURL})`, inline: true });

    return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
  }
};
