const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { logModeration } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delwarn')
    .setDescription('Remove a single warning from a member\'s record')
    .addUserOption(option => option.setName('target').setDescription('Member to update').setRequired(true))
    .addIntegerOption(option => option.setName('id').setDescription('Warning ID to remove').setRequired(true).setMinValue(1)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, user: moderator }) {
    let user, id;
    if (isSlash) {
      user = interaction.options.getUser('target');
      id = interaction.options.getInteger('id');
    } else {
      user = message.mentions.users.first() || guild.members.cache.get(args[0])?.user || null;
      id = parseInt(args[1]);
    }

    if (!user || !Number.isInteger(id)) {
      const response = 'Usage: l delwarn @user <id>';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const removed = db.removeWarning(guild.id, user.id, id);
    const response = removed
      ? `Removed warning **#${id}** from ${user.tag}.`
      : `No warning **#${id}** found for ${user.tag}.`;

    if (removed) {
      logModeration(guild, 'Warning removed', `Warning **#${id}** was removed from ${user} by ${moderator}.`);
    }

    return isSlash
      ? interaction.reply({ content: response, ephemeral: !removed })
      : message.reply(response);
  }
};
