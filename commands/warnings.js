const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

const MAX_SHOWN = 20;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View the warnings on a member\'s record')
    .addUserOption(option => option.setName('target').setDescription('Member to inspect').setRequired(true)),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ModerateMembers],
  async run({ interaction, message, isSlash, args, guild, client }) {
    let user;
    if (isSlash) {
      user = interaction.options.getUser('target');
    } else {
      user = message.mentions.users.first()
        || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
    }

    if (!user) {
      const response = 'Please mention a member to inspect.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const warnings = db.getWarnings(guild.id, user.id);
    const shown = warnings.slice(-MAX_SHOWN);
    const lines = shown.map(warning =>
      `\`#${warning.id}\` — ${warning.reason}\n> by <@${warning.moderatorId}> · <t:${Math.floor(warning.timestamp / 1000)}:R>`
    );

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: `${user.tag} · Warning record`, iconURL: user.displayAvatarURL() })
      .setTitle(`📋 ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)
      .setDescription(
        warnings.length
          ? `${lines.join('\n')}${warnings.length > MAX_SHOWN ? `\n\n**+${warnings.length - MAX_SHOWN} older warning(s) hidden.**` : ''}`
          : '✅ This member has a clean record.'
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: LOBSTER_FOOTER })
      .setTimestamp();

    return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
  }
};
