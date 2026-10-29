const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getLogConfig } = require('../utils/logging/config');
const { buildPanel } = require('../utils/logging/panel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure Lobster server logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  aliases: ['log'],
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, guild, member, user }) {
    const activeGuild = interaction?.guild || guild;
    const actor = interaction?.user || user || message?.author;
    if (!activeGuild) {
      if (isSlash) {
        await interaction.reply({ content: 'Logging can only be configured in a server.', flags: MessageFlags.Ephemeral });
      } else {
        await message.reply('Logging can only be configured in a server.');
      }
      return;
    }
    const permissions = interaction?.memberPermissions || member?.permissions;
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      const warning = 'You need the Manage Server permission to configure logging.';
      if (isSlash) await interaction.reply({ content: warning, flags: MessageFlags.Ephemeral });
      else await message.reply(warning);
      return;
    }
    const config = getLogConfig(activeGuild.id);
    const panel = buildPanel(activeGuild, config, actor);
    if (isSlash) {
      await interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
    } else {
      await message.reply(panel);
    }
  }
};
