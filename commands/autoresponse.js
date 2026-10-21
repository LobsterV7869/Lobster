const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponse')
    .setDescription('Manage simple keyword replies for this server')
    .addSubcommand(subcommand => subcommand
      .setName('add')
      .setDescription('Add or update an automatic reply')
      .addStringOption(option => option.setName('trigger').setDescription('Keyword or phrase').setRequired(true).setMaxLength(100))
      .addStringOption(option => option.setName('response').setDescription('Reply sent when the phrase is used').setRequired(true).setMaxLength(1500)))
    .addSubcommand(subcommand => subcommand
      .setName('remove')
      .setDescription('Remove an automatic reply')
      .addStringOption(option => option.setName('trigger').setDescription('Keyword or phrase to remove').setRequired(true).setMaxLength(100)))
    .addSubcommand(subcommand => subcommand
      .setName('list')
      .setDescription('List automatic replies')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, guild }) {
    const action = isSlash ? interaction.options.getSubcommand() : args[0]?.toLowerCase();
    const replies = db.getAutoReplies(guild.id);

    if (action === 'add') {
      const trigger = isSlash ? interaction.options.getString('trigger') : args[1];
      const response = isSlash ? interaction.options.getString('response') : args.slice(2).join(' ');
      if (!trigger || !response) {
        const text = 'Use `autoresponse add <trigger> <response>`.';
        return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
      }
      if (Object.keys(replies).length >= 50 && !Object.keys(replies).some(key => key.toLowerCase() === trigger.toLowerCase())) {
        const text = 'This server already has 50 automatic replies. Remove one before adding another.';
        return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
      }
      db.setAutoReply(guild.id, trigger.trim(), response.trim());
      const text = `Automatic reply saved for **${trigger.trim()}**.`;
      return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
    }

    if (action === 'remove') {
      const trigger = isSlash ? interaction.options.getString('trigger') : args[1];
      if (!trigger) {
        const text = 'Usage: l autoresponse remove <trigger>';
        return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
      }
      const removed = db.removeAutoReply(guild.id, trigger);
      const text = removed ? `Removed the automatic reply for **${trigger}**.` : 'No automatic reply has that trigger.';
      return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
    }

    if (action !== 'list' && !isSlash) {
      const text = 'Use `autoresponse add <trigger> <response>`, `autoresponse remove <trigger>`, or `autoresponse list`.';
      return message.reply(text);
    }

    const entries = Object.entries(replies);
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setTitle('Automatic replies')
      .setDescription(entries.length
        ? entries.slice(0, 20).map(([trigger, response]) =>
          `**${trigger.slice(0, 100)}** → ${response.slice(0, 160)}`
        ).join('\n')
        : 'No automatic replies are configured.')
      .setFooter({ text: `${entries.length} / 50 triggers · Replies use literal, case-insensitive matching.` });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
