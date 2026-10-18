const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const music = require('../utils/music');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from a search, a link, or a Spotify track')
    .addStringOption(option => option
      .setName('query')
      .setDescription('A song name, or a YouTube/Spotify link')
      .setRequired(true))
    .addBooleanOption(option => option
      .setName('next')
      .setDescription('Add it to the front of the queue instead of the end')),
  category: 'Music',
  botPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async run({ client, interaction, message, isSlash, member, guild, user, args }) {
    const query = isSlash ? interaction.options.getString('query') : args.join(' ').trim();
    const playNext = isSlash ? Boolean(interaction.options.getBoolean('next')) : false;

    if (!query) {
      const prompt = 'Tell me what to play — a song name, a link, or a Spotify track.';
      return isSlash ? interaction.reply(prompt) : message.reply(prompt);
    }

    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      const prompt = 'Join a voice channel first, then ask me to play something.';
      return isSlash ? interaction.reply(prompt) : message.reply(prompt);
    }

    let pending;
    if (isSlash) {
      await interaction.deferReply();
    } else {
      pending = await message.reply('🔎 Searching…');
    }

    let result;
    try {
      result = await music.enqueue({ guild, voiceChannel, query, user, playNext });
    } catch (error) {
      const content = `I could not play that: ${error.message}`;
      return isSlash ? interaction.editReply({ content }) : pending.edit({ content });
    }

    const { track, position } = result;
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Music', iconURL: client.user.displayAvatarURL() })
      .setTitle(position === 0 ? '▶️ Now playing' : '➕ Added to the queue')
      .setDescription([
        `[${track.title}](${track.url})`,
        `\`${music.formatDuration(track.duration)}\` · requested by <@${user.id}>`,
        position === 0 ? '' : `Queue position: **#${position}**`
      ].filter(Boolean).join('\n'))
      .setFooter({ text: LOBSTER_FOOTER });
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    return isSlash
      ? interaction.editReply({ embeds: [embed] })
      : pending.edit({ embeds: [embed] });
  }
};
