const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../utils/wordgame-text');
const { makeUsageEmbed, makeStartedEmbed, makeGameOverEmbed, makeStatsEmbed, makeTopEmbed, startGame, stopGame } = require('../utils/wordgame');
const { getLang, getGameChannel } = require('../utils/wordgame-store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordgame')
    .setDescription('Start or stop the word chain game')
    .addStringOption(option => option
      .setName('action')
      .setDescription('Start, stop, stats, or top')
      .setRequired(false)
      .addChoices(
        { name: 'Start', value: 'start' },
        { name: 'Stop', value: 'stop' },
        { name: 'Stats', value: 'stats' },
        { name: 'Top', value: 'top' }
      ))
    .addStringOption(option => option
      .setName('language')
      .setDescription('Game language')
      .addChoices({ name: 'Azerbaijani', value: 'az' }, { name: 'English', value: 'en' })),
  category: 'Community',
  permissions: [],
  async run(context) {
    try {
      const { interaction, message, guild, isSlash, args, user } = context;
      const channel = isSlash && interaction ? interaction.channel : (message ? message.channel : null);
      const actorId = isSlash && interaction ? interaction.user.id : (user?.id || message?.author?.id);

      if (!guild) {
        if (isSlash && interaction) return interaction.reply({ content: 'Use in a server.', ephemeral: true });
        if (message) return message.reply('Use in a server.');
        return;
      }

      let action;
      let langOverride;
      if (isSlash && interaction) {
        action = interaction.options.getString('action');
        langOverride = interaction.options.getString('language');
      } else {
        const parts = (args || []).map(p => String(p).toLowerCase());
        action = parts[0];
        if (parts.includes('az')) langOverride = 'az';
        if (parts.includes('en')) langOverride = 'en';
      }

      const lang = getLang(guild.id, langOverride);

      if (!action || !['start', 'stop', 'stats', 'top'].includes(action)) {
        const embed = makeUsageEmbed(guild);
        if (isSlash && interaction) {
          if (interaction.deferred || interaction.replied) return interaction.followUp({ embeds: [embed], ephemeral: true });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (message) return message.reply({ embeds: [embed] });
        return;
      }

      if (action === 'stats') {
        const embed = makeStatsEmbed(lang, guild.id, actorId);
        if (isSlash && interaction) {
          if (interaction.deferred || interaction.replied) return interaction.followUp({ embeds: [embed], ephemeral: true });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (message) return message.reply({ embeds: [embed] });
        return;
      }

      if (action === 'top') {
        const embed = makeTopEmbed(lang, guild.id);
        if (isSlash && interaction) {
          if (interaction.deferred || interaction.replied) return interaction.followUp({ embeds: [embed], ephemeral: true });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (message) return message.reply({ embeds: [embed] });
        return;
      }

      if (action === 'start') {
        const gameChannelId = getGameChannel(guild.id) || (channel ? channel.id : null);
        const targetChannel = (channel && channel.guild && channel.guild.id === guild.id) ? channel : (guild.channels.cache.get(gameChannelId) || channel);
        const res = await startGame({ guild, channel: targetChannel || channel, lang, userId: actorId });
        if (!res.ok) {
          let msg;
          if (res.reason === 'already') msg = t(lang, 'game_already');
          else if (res.reason === 'dict_missing') msg = t(lang, 'dict_missing');
          else msg = t(lang, 'dict_missing');
          if (isSlash && interaction) {
            if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, ephemeral: true });
            return interaction.reply({ content: msg, ephemeral: true });
          }
          if (message) return message.reply(msg);
          return;
        }
        const embed = makeStartedEmbed(lang, res.firstWord);
        const payload = { embeds: [embed] };
        if (isSlash && interaction) {
          if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
          return interaction.reply(payload);
        }
        if (message) return message.reply(payload);
        return;
      }

      if (action === 'stop') {
        const res = stopGame({ guild, lang });
        if (!res.ok) {
          const msg = t(lang, 'game_none');
          if (isSlash && interaction) {
            if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, ephemeral: true });
            return interaction.reply({ content: msg, ephemeral: true });
          }
          if (message) return message.reply(msg);
          return;
        }
        const embed = makeGameOverEmbed(lang, res.stateLang);
        const payload = { embeds: [embed] };
        if (isSlash && interaction) {
          if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
          return interaction.reply(payload);
        }
        if (message) return message.reply(payload);
        return;
      }
    } catch (e) {
      console.error('wordgame run error:', e);
      throw e;
    }
  }
};
