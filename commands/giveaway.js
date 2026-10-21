const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/database');

function parsePrefixArguments(args) {
  const durationMinutes = value => {
    const match = String(value || '').match(/^(\d+)(m|h|d)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const multiplier = { m: 1, h: 60, d: 1440 }[(match[2] || 'm').toLowerCase()];
    return amount * multiplier;
  };
  const firstDuration = durationMinutes(args[0]);
  if (firstDuration !== null) {
    const hasWinnerCount = args.length >= 3 && /^\d+$/.test(args[1]);
    return {
      duration: firstDuration,
      winners: hasWinnerCount ? Number(args[1]) : 1,
      prize: args.slice(hasWinnerCount ? 2 : 1).join(' ')
    };
  }
  const penultimateDuration = durationMinutes(args.at(-2));
  if (penultimateDuration !== null && /^\d+$/.test(args.at(-1) || '')) {
    return {
      duration: penultimateDuration,
      winners: Number(args.at(-1)),
      prize: args.slice(0, -2).join(' ')
    };
  }
  const lastDuration = durationMinutes(args.at(-1));
  if (lastDuration !== null) {
    const hasWinnerCount = args.length >= 3 && /^\d+$/.test(args.at(-2));
    return {
      duration: lastDuration,
      winners: hasWinnerCount ? Number(args.at(-2)) : 1,
      prize: args.slice(0, hasWinnerCount ? -2 : -1).join(' ')
    };
  }
  return { prize: '', duration: NaN, winners: 1 };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway')
    .addStringOption(opt => opt.setName('prize').setDescription('Prize for the giveaway').setRequired(true).setMaxLength(256))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (1-10080)').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners (defaults to 1)').setMinValue(1).setMaxValue(20)),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, channel, user, guild }) {
    let prize, duration, winners;
    if (isSlash) {
      prize = interaction.options.getString('prize');
      duration = interaction.options.getInteger('duration');
      winners = interaction.options.getInteger('winners') || 1;
    } else {
      ({ prize, duration, winners } = parsePrefixArguments(args));
    }

    if (!prize || prize.length > 256 || !Number.isInteger(duration) || duration < 1 || duration > 10080
      || !Number.isInteger(winners) || winners < 1 || winners > 20) {
      const response = '🎉 Let us run a giveaway!\n`l giveaway <duration> <prize>`\n-# Duration like `10m`, `2h` or `1d`.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const endTime = Date.now() + (duration * 60 * 1000);
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setAuthor({ name: 'Lobster · Community giveaway' })
      .setTitle('🎉 Giveaway')
      .setDescription(`Prize: **${prize}**\nWinners: **${winners}**\nEnds: <t:${Math.floor(endTime / 1000)}:R>\nHosted by: ${user}`)
      .setFooter({ text: 'Join with the button below · Lobster' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('giveaway_join').setLabel('Join giveaway').setStyle(ButtonStyle.Primary)
    );

    const msg = isSlash 
      ? await interaction.reply({ embeds: [embed], components: [row], fetchReply: true })
      : await message.reply({ embeds: [embed], components: [row] });

    db.createGiveaway({
      messageId: msg.id,
      channelId: channel.id,
      guildId: guild.id,
      prize,
      endTime,
      winners,
      hostId: user.id
    });
  },
  parsePrefixArguments
};
