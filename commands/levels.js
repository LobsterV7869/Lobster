const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Configure chat levels for this server')
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable chat XP'))
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Optional channel for level-up announcements')
      .addChannelTypes(ChannelType.GuildText)),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    let channel;
    let enabled;

    if (isSlash) {
      channel = interaction.options.getChannel('channel');
      enabled = interaction.options.getBoolean('enabled');
    } else {
      channel = message.mentions.channels.first()
        || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)));
      const state = args.find(arg => ['on', 'enable', 'enabled', 'off', 'disable', 'disabled'].includes(arg.toLowerCase()));
      if (state) enabled = ['on', 'enable', 'enabled'].includes(state.toLowerCase());
    }

    if (channel) db.updateSetting(guild.id, 'levelUpChannel', channel.id);
    if (enabled !== undefined && enabled !== null) {
      db.updateSetting(guild.id, 'levelsEnabled', Number(enabled));
    }

    const updated = db.getSettings(guild.id);
    const announceChannel = updated.levelUpChannel
      ? guild.channels.cache.get(updated.levelUpChannel)
      : null;
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setTitle('Chat levels')
      .setDescription(
        `Chat XP is **${updated.levelsEnabled ? 'enabled' : 'disabled'}**.\n` +
        `Members earn XP for chatting (once per minute). View ranks with \`/level\` and \`/leaderboard\`.\n` +
        `Level-up announcements: ${announceChannel || 'the channel where the member chatted'}.`
      )
      .addFields({
        name: 'Prefix commands',
        value: `\`${updated.prefix} levels on\`\n\`${updated.prefix} levels off\`\n\`${updated.prefix} levels #announcements\``
      });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
