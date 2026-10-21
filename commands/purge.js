const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages with optional filters')
    .addIntegerOption(option => option.setName('amount').setDescription('How many recent messages to scan (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(option => option.setName('user').setDescription('Only delete messages from this member'))
    .addStringOption(option => option.setName('contains').setDescription('Only delete messages containing this text').setMaxLength(100))
    .addBooleanOption(option => option.setName('bots').setDescription('Only delete messages sent by bots')),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, channel, guild }) {
    let amount, user, contains, bots;
    if (isSlash) {
      amount = interaction.options.getInteger('amount');
      user = interaction.options.getUser('user');
      contains = interaction.options.getString('contains');
      bots = interaction.options.getBoolean('bots');
    } else {
      amount = parseInt(args[0]);
      user = message.mentions.users.first() || null;
      const rest = args.filter((value, index) => !(index === 0 || value.startsWith('<@')));
      if (rest[0]?.toLowerCase() === 'bots') bots = true;
      else contains = rest.join(' ') || undefined;
    }

    if (!amount || amount < 1 || amount > 100) {
      const response = 'Usage: l purge <amount> [@user] [bots|text]';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const fetched = await channel.messages.fetch({ limit: amount });
    let targets = [...fetched.values()];
    if (user) targets = targets.filter(target => target.author.id === user.id);
    if (typeof bots === 'boolean') targets = targets.filter(target => target.author.bot === bots);
    if (contains) {
      const needle = contains.toLowerCase();
      targets = targets.filter(target => target.content.toLowerCase().includes(needle));
    }

    if (!targets.length) {
      const response = 'No messages matched those filters.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const deleted = await channel.bulkDelete(targets, true);
    const response = `Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'}.`;
    if (isSlash) {
      return interaction.reply({ content: response, ephemeral: true });
    }
    const notice = await message.channel.send(response).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 3000);
  }
};
