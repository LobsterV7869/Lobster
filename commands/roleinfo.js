const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { LOBSTER_ORANGE } = require('../utils/command-style');

const IMPORTANT_PERMISSIONS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageMessages',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'ViewAuditLog',
  'MentionEveryone'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Show detailed information about a server role')
    .addRoleOption(option => option.setName('role').setDescription('Role to inspect').setRequired(true)),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, guild }) {
    const role = isSlash
      ? interaction.options.getRole('role')
      : message.mentions.roles.first()
        || guild.roles.cache.get(args.find(argument => /^\d{17,20}$/.test(argument))?.replace(/[<@&>]/g, ''))
        || guild.roles.cache.find(item => item.name.toLowerCase() === args.join(' ').toLowerCase());
    if (!role) {
      const response = 'Usage: `p roleinfo @Moderator`.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    const importantPermissions = IMPORTANT_PERMISSIONS
      .filter(name => role.permissions.has(PermissionFlagsBits[name]))
      .map(name => name.replace(/([a-z])([A-Z])/g, '$1 $2'));
    const members = role.members.size;
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Role profile' })
      .setTitle(role.name)
      .setDescription([
        `**Role:** <@&${role.id}>`,
        `**ID:** \`${role.id}\``,
        `**Color:** \`#${role.color.toString(16).padStart(6, '0').toUpperCase()}\``
      ].join('\n'))
      .addFields(
        { name: 'Cached members', value: members.toLocaleString(), inline: true },
        { name: 'Position', value: `${role.position} of ${guild.roles.cache.size - 1}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Displayed separately', value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Managed by integration', value: role.managed ? 'Yes' : 'No', inline: true },
        {
          name: 'Key permissions',
          value: importantPermissions.length ? importantPermissions.join(' · ') : 'No elevated permissions',
          inline: false
        }
      )
      .setFooter({ text: `${guild.name} · Role information` })
      .setTimestamp();

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
