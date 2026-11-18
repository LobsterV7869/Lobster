const { SlashCommandBuilder, ActivityType } = require('discord.js');

const BAR_LENGTH = 16;

function spotifyActivity(member) {
  const activities = member?.presence?.activities || [];
  return activities.find(activity =>
    activity.type === ActivityType.Listening && activity.name === 'Spotify'
  ) || null;
}

function coverURL(activity) {
  const image = activity?.assets?.largeImage;
  if (!image) return null;
  const id = image.startsWith('spotify:image:') ? image.slice('spotify:image:'.length) : image;
  return `https://i.scdn.co/image/${id}`;
}

function clock(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function progressText(start, end) {
  if (!start || !end) return null;
  const total = Math.max(1, end - start);
  const elapsed = Math.min(total, Math.max(0, Date.now() - start));
  const pct = Math.round((elapsed / total) * 100);
  return `${clock(elapsed)} / ${clock(total)} (${pct}%)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Show the Spotify track a member is listening to right now')
    .addUserOption(option => option.setName('target').setDescription('Member to check').setRequired(false)),
  aliases: ['spo', 'sp'],
  category: 'Music',
  async run({ interaction, message, isSlash, args, guild, client, user: ctxUser }) {
    const { replyWithCard } = require('../canvas/send');
    const target = interaction || message;
    if (!target) return;

    const g = interaction?.guild ?? message?.guild ?? guild;
    const c = interaction?.client ?? message?.client ?? client;
    const requester = interaction?.user ?? message?.author ?? ctxUser;

    let user;
    if (interaction) {
      user = interaction.options.getUser('target') || interaction.user;
    } else {
      user = message?.mentions?.users?.first?.()
        || (args && args[0] && c?.users?.fetch ? await c.users.fetch(args[0]).catch(() => null) : null)
        || message?.author
        || requester;
    }

    if (!user) {
      return replyWithCard(target, 'result', {
        type: 'info',
        title: 'Spotify',
        description: 'Whose music should I show? Use: l spotify [@user]. They need Spotify connected and activity sharing enabled.',
      });
    }

    const member = g?.members?.cache?.get(user.id)
      || (g?.members?.fetch ? await g.members.fetch(user.id).catch(() => null) : null);
    const activity = spotifyActivity(member);

    if (!activity) {
      const activities = member?.presence?.activities || [];
      const hint = !member?.presence
        ? 'I cannot see any presence from this member.'
        : activities.length === 0
          ? 'No activity is being shared. Enable Activity Privacy sharing and display Spotify as your status, then play from the Spotify app.'
          : 'This member is not listening to Spotify right now.';
      return replyWithCard(target, 'result', {
        type: 'info',
        title: 'Spotify',
        description: `${member?.displayName || user.username} is not listening to Spotify right now. ${hint}`,
        fields: [
          { label: 'User', value: member?.displayName || user.username || 'Unknown' },
          { label: 'Status', value: member?.presence ? 'Presence visible' : 'Presence hidden' },
        ],
      });
    }

    const song = activity.details || activity.name || 'Unknown track';
    const artists = activity.state || 'Unknown artist';
    const album = activity.assets?.largeText || null;
    const start = activity.timestamps?.start ? activity.timestamps.start.getTime() : null;
    const end = activity.timestamps?.end ? activity.timestamps.end.getTime() : null;
    const trackURL = activity.syncId ? `https://open.spotify.com/track/${activity.syncId}` : null;
    const cover = coverURL(activity);
    const progress = progressText(start, end);

    const stats = [
      { label: 'Artist', value: artists },
      ...(album ? [{ label: 'Album', value: album }] : []),
      ...(progress ? [{ label: 'Progress', value: progress }] : []),
      { label: 'Listening', value: member?.displayName || user.username || 'Member' },
    ];

    return replyWithCard(target, 'profile', {
      avatarUrl: cover || (typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ extension: 'png', size: 512 }) : null),
      username: song,
      tag: artists,
      badges: ['Spotify'],
      level: 0,
      xp: start && end ? Math.min(end - start, Math.max(0, Date.now() - start)) : 0,
      xpNeeded: start && end ? Math.max(1, end - start) : 1,
      rank: 'Now',
      stats,
    });
  },
};
