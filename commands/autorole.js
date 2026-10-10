const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { roleHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Enable or disable the autorole system')
    .addRoleOption(opt => opt.setName('role').setDescription('Role to give on join'))
    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable autorole')),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  async run({ interaction, message, isSlash, args, guild, member }) {
    const settings = db.getSettings(guild.id);
    const role = isSlash
      ? interaction.options.getRole('role')
      : message.mentions.roles.first() || guild.roles.cache.get(args.find(arg => /^\d{17,20}$/.test(arg)));
    const requestedState = isSlash
      ? interaction.options.getBoolean('enabled')
      : args.some(arg => ['off', 'disable', 'disabled'].includes(arg.toLowerCase())) ? false
        : args.some(arg => ['on', 'enable', 'enabled'].includes(arg.toLowerCase())) ? true : null;

    if (requestedState === false || (!role && settings.autorole && requestedState !== true)) {
      db.updateSetting(guild.id, 'autorole', null);
      return isSlash ? interaction.reply('❌ Autorole system disabled.') : message.reply('❌ Autorole system disabled.');
    }

    if (!role) {
      const response = settings.autorole
        ? `Autorole is enabled for <@&${settings.autorole}>. Provide a role to change it, or use \`${settings.prefix} autorole off\` to disable.`
        : `Specify a role to enable autorole.`;
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const hierarchyError = roleHierarchyError(member, role, guild);
    if (hierarchyError) {
      return isSlash
        ? interaction.reply({ content: hierarchyError, ephemeral: true })
        : message.reply(hierarchyError);
    }

    db.updateSetting(guild.id, 'autorole', role.id);
    const embed = new EmbedBuilder().setColor('#00ff00').setDescription(`✅ Autorole system enabled. New members will get ${role}.`);
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
