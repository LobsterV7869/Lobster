const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { logModeration } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear every warning on a member\'s record')
    .addUserOption(option => option.setName('target').setDescription('Member whose record to clear').setRequired(true)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, user: moderator }) {
    let user;
    if (isSlash) {
      user = interaction.options.getUser('target');
    } else {
      user = message.mentions.users.first() || guild.members.cache.get(args[0])?.user || null;
    }

    if (!user) {
      const response = '🧹 Whose slate should I wipe clean?\n`l clearwarnings @user`\n-# Clears every warning for that member.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const count = db.clearWarnings(guild.id, user.id);
    const response = count
      ? `Cleared **${count}** warning${count === 1 ? '' : 's'} from ${user.tag}.`
      : `${user.tag} has no warnings to clear.`;

    if (count) {
      logModeration(guild, 'Warnings cleared', `${moderator} cleared **${count}** warning(s) from ${user}.`);
    }

    return isSlash
      ? interaction.reply({ content: response, ephemeral: !count })
      : message.reply(response);
  }
};
