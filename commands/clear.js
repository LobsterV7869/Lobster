const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of messages to delete').setRequired(true).setMinValue(1).setMaxValue(100)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, channel }) {
    const amount = isSlash ? interaction.options.getInteger('amount') : parseInt(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      const response = '🧽 How many messages should I clear?\n`l clear <1-100>`\n-# Between 1 and 100 messages.';
      return isSlash
        ? interaction.reply({ content: '🧽 How many messages should I clear?\n`l clear <1-100>`\n-# Between 1 and 100 messages.', ephemeral: true })
        : message.reply(response);
    }

    const deleted = await channel.bulkDelete(amount, true);
    const response = `Deleted ${deleted.size} messages.`;
    if (isSlash) await interaction.reply({ content: response, ephemeral: true });
    else message.channel.send(response).then(m => setTimeout(() => m.delete(), 3000));
  }
};
