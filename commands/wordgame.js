const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const fs = require('node:fs');
const path = require('node:path');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'wordgame.json'), 'utf8'));
const games = new Map();
const ZOOM_FACE = '<:ZoomFace:1565459448552620163>';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordgame')
    .setDescription('Start or stop a word game')
    .addStringOption(option => option
      .setName('action')
      .setDescription('Start or stop the game')
      .setRequired(true)
      .addChoices({ name: 'Start', value: 'start' }, { name: 'Stop', value: 'stop' }))
    .addStringOption(option => option
      .setName('language')
      .setDescription('Game language')
      .addChoices({ name: 'Azerbaijani', value: 'az' }, { name: 'English', value: 'en' })),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageMessages],
  async run({ interaction, guild, isSlash }) {
    if (!isSlash) return interaction.reply({ content: 'Use slash commands.', ephemeral: true });

    const action = interaction.options.getString('action');
    const lang = interaction.options.getString('language') || 'az';

    if (action === 'start') {
      if (games.has(interaction.channelId)) return interaction.reply({ content: `${ZOOM_FACE} A game is already active in this channel!`, ephemeral: true });
      
      const word = words[Math.floor(Math.random() * words.length)];
      games.set(interaction.channelId, { ...word, lang });
      
      const embed = new EmbedBuilder()
        .setColor('#5BA6FB')
        .setTitle(`${ZOOM_FACE} Word Game Started!`)
        .setDescription(`Translate this word: **${lang === 'az' ? word.az : word.en}**`);
      
      interaction.reply({ embeds: [embed] });
    } else {
      if (!games.has(interaction.channelId)) return interaction.reply({ content: `${ZOOM_FACE} No active game here.`, ephemeral: true });
      games.delete(interaction.channelId);
      interaction.reply({ content: `${ZOOM_FACE} Game stopped.` });
    }
  },
  games // Export for index.js to use
};
