const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const music = require('../utils/music');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show what is playing and what is coming up next'),
  category: 'Music',
  async run({ client, interaction, message, isSlash, guild }) {
    const state = music.getState(guild);
    if (!state?.current) {
      const content = 'The queue is empty. Use `/play` to add a song.';
      return isSlash ? interaction.reply(content) : message.reply(content);
    }

    const upcoming = state.tracks.slice(0, 10).map((track, index) =>
      `**${index + 1}.** [${track.title}](${track.url}) \`${music.formatDuration(track.duration)}\``);
    const remaining = state.tracks.length - upcoming.length;

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Music', iconURL: client.user.displayAvatarURL() })
      .setTitle('🎶 Queue')
      .setDescription([
        `**Now playing**\n[${state.current.title}](${state.current.url}) \`${music.formatDuration(state.current.duration)}\``,
        '',
        upcoming.length ? `**Up next**\n${upcoming.join('\n')}` : '**Up next**\nNothing else is queued.',
        remaining > 0 ? `\n…and **${remaining}** more.` : ''
      ].filter(Boolean).join('\n'))
      .setFooter({ text: `${LOBSTER_FOOTER} · volume ${Math.round(state.volume * 100)}%` });

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
