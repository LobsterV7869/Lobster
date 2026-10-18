const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Configure account-age checks, bot blocking, and anti-nuke protection')
    .addIntegerOption(option => option.setName('min_account_age_days').setDescription('Kick new accounts younger than this (0 disables)').setMinValue(0).setMaxValue(365))
    .addBooleanOption(option => option.setName('block_bots').setDescription('Block bots from joining'))
    .addBooleanOption(option => option.setName('anti_nuke').setDescription('Kick members who exceed the server-change action limit'))
    .addIntegerOption(option => option.setName('action_limit').setDescription('Actions before kick (2-10)').setMinValue(2).setMaxValue(10))
    .addIntegerOption(option => option.setName('window_seconds').setDescription('Action counting window (5-60 seconds)').setMinValue(5).setMaxValue(60))
    .addRoleOption(option => option.setName('exempt_role').setDescription('Role exempt from anti-nuke monitoring'))
    .addRoleOption(option => option.setName('remove_exempt_role').setDescription('Remove a role exemption')),
  category: 'Security',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild, member }) {
    const current = db.getSettings(guild.id);
    let minAge;
    let blockBots;
    let antiNukeEnabled;
    let actionLimit;
    let windowSeconds;
    let exemptRole;
    let removeExemptRole;
    if (isSlash) {
      minAge = interaction.options.getInteger('min_account_age_days');
      blockBots = interaction.options.getBoolean('block_bots');
      antiNukeEnabled = interaction.options.getBoolean('anti_nuke');
      actionLimit = interaction.options.getInteger('action_limit');
      windowSeconds = interaction.options.getInteger('window_seconds');
      exemptRole = interaction.options.getRole('exempt_role');
      removeExemptRole = interaction.options.getRole('remove_exempt_role');
    } else {
      const readOption = name => {
        const index = args.indexOf(`--${name}`);
        return index === -1 ? undefined : args[index + 1];
      };
      if (readOption('min-age') !== undefined) minAge = Number(readOption('min-age'));
      if (readOption('block-bots') !== undefined) blockBots = ['on', 'true', 'yes'].includes(readOption('block-bots').toLowerCase());
      if (readOption('anti-nuke') !== undefined) antiNukeEnabled = ['on', 'true', 'yes'].includes(readOption('anti-nuke').toLowerCase());
      if (readOption('limit') !== undefined) actionLimit = Number(readOption('limit'));
      if (readOption('window') !== undefined) windowSeconds = Number(readOption('window'));
      exemptRole = message.mentions.roles.first();
      const removeIndex = args.indexOf('--remove-exempt-role');
      if (removeIndex !== -1) {
        const roleId = args[removeIndex + 1]?.replace(/[<@&>]/g, '');
        removeExemptRole = guild.roles.cache.get(roleId);
      }
    }

    if (minAge !== undefined && (!Number.isInteger(minAge) || minAge < 0 || minAge > 365)) {
      const response = 'Minimum account age must be between 0 and 365 days.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (actionLimit !== undefined && (!Number.isInteger(actionLimit) || actionLimit < 2 || actionLimit > 10)) {
      const response = 'Action limit must be between 2 and 10.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (windowSeconds !== undefined && (!Number.isInteger(windowSeconds) || windowSeconds < 5 || windowSeconds > 60)) {
      const response = 'The action window must be between 5 and 60 seconds.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (exemptRole && (
      exemptRole.id === guild.id
      || exemptRole.managed
      || (member.id !== guild.ownerId && exemptRole.comparePositionTo(member.roles.highest) >= 0)
    )) {
      const response = 'Choose an unmanaged role below your highest role as the anti-nuke exemption.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (removeExemptRole && (
      removeExemptRole.id === guild.id
      || removeExemptRole.managed
      || (member.id !== guild.ownerId && removeExemptRole.comparePositionTo(member.roles.highest) >= 0)
    )) {
      const response = 'Choose an unmanaged role below your highest role.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    const needsKickPermission = minAge > 0
      || blockBots === true
      || antiNukeEnabled === true;
    if (needsKickPermission && !guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      const response = 'I need the Kick Members permission to enforce account checks and anti-nuke protection.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (antiNukeEnabled === true && !guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      const response = 'I need the View Audit Log permission to monitor anti-nuke events.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    if (minAge !== undefined) db.updateSetting(guild.id, 'minAccountAgeDays', minAge);
    if (blockBots !== undefined) db.updateSetting(guild.id, 'blockBots', blockBots);
    if (actionLimit !== undefined) {
      db.updateSetting(guild.id, 'antiNuke', { ...current.antiNuke, limit: actionLimit });
    }
    if (windowSeconds !== undefined) {
      const settings = db.getSettings(guild.id);
      db.updateSetting(guild.id, 'antiNuke', { ...settings.antiNuke, windowSeconds });
    }
    if (antiNukeEnabled !== undefined) {
      const settings = db.getSettings(guild.id);
      db.updateSetting(guild.id, 'antiNuke', { ...settings.antiNuke, enabled: antiNukeEnabled });
    }
    if (exemptRole) {
      const settings = db.getSettings(guild.id);
      const roles = new Set(settings.antiNuke.exemptRoleIds);
      roles.add(exemptRole.id);
      db.updateSetting(guild.id, 'antiNuke', { ...settings.antiNuke, exemptRoleIds: [...roles] });
    }
    if (removeExemptRole) {
      const settings = db.getSettings(guild.id);
      db.updateSetting(guild.id, 'antiNuke', {
        ...settings.antiNuke,
        exemptRoleIds: settings.antiNuke.exemptRoleIds.filter(roleId => roleId !== removeExemptRole.id)
      });
    }

    const updated = db.getSettings(guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setTitle('Server security')
      .setDescription([
        `Minimum account age: **${updated.minAccountAgeDays ? `${updated.minAccountAgeDays} days` : 'off'}**`,
        `Block bot accounts: **${updated.blockBots ? 'on' : 'off'}**`,
        `Anti-nuke protection: **${updated.antiNuke.enabled ? 'on' : 'off'}**`,
        `Anti-nuke action limit: **${updated.antiNuke.limit} changes in ${updated.antiNuke.windowSeconds} seconds**`,
        `Exempt roles: ${updated.antiNuke.exemptRoleIds.length ? updated.antiNuke.exemptRoleIds.map(id => `<@&${id}>`).join(', ') : 'none'}`
      ].join('\n'))
      .addFields({
        name: 'What protection does',
        value: 'Account checks kick new accounts below your chosen age; anti-nuke kicks a non-exempt member after repeated channel/role changes, bans, kicks, webhook changes, or emoji changes. Use conservative limits and keep trusted roles exempt.'
      })
      .setFooter({ text: 'Anti-nuke is off by default. The bot needs Kick Members and View Audit Log.' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
