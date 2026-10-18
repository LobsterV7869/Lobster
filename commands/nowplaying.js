const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const music = require('../utils/music');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the song that is currently playing'),
  category: 'Music',
  async run({ client, interaction, message, isSlash, guild }) {
    const state = music.getState(guild);
    if (!state?.current) {
      const content = 'Nothing is playing right now. Use `/play` to start a song.';
      return isSlash ? interaction.reply(content) : message.reply(content);
    }

    const track = state.current;
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Music', iconURL: client.user.displayAvatarURL() })
      .setTitle(state.paused ? '⏸️ Paused' : '▶️ Now playing')
      .setDescription([
        `[${track.title}](${track.url})`,
        `\`${music.formatDuration(track.duration)}\``,
        `<@${track.requestedBy}> · volume ${Math.round(state.volume * 100)}%`
      ].join('\n'))
      .setFooter({ text: `${LOBSTER_FOOTER} · ${state.tracks.length} song${state.tracks.length === 1 ? '' : 's'} queued` });
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
