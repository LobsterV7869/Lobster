const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antiself')
    .setDescription('Disable or restore external apps usage in all channels')
    .addBooleanOption(option => option.setName('enabled').setDescription('Disable or restore external app usage')),
  category: 'Security',
  permissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const stateArg = args[0]?.toLowerCase();
    const requestedState = isSlash
      ? interaction.options.getBoolean('enabled')
      : ['on', 'enable', 'enabled', 'off', 'disable', 'disabled'].includes(stateArg)
        ? ['on', 'enable', 'enabled'].includes(stateArg)
        : null;
    if (requestedState !== null && Boolean(settings.antiself) === requestedState) {
      const status = `External Apps usage is already ${requestedState ? 'disabled' : 'restored'} in this server.`;
      return isSlash ? interaction.reply({ content: status, ephemeral: true }) : message.reply(status);
    }
    const disabling = requestedState === null ? !settings.antiself : requestedState;
    const savedPermissions = disabling && !settings.antiself
      ? Object.fromEntries(guild.channels.cache.map(channel => {
        const overwrite = channel.permissionOverwrites.cache.get(guild.id);
        const original = overwrite?.allow.has(PermissionFlagsBits.UseExternalApps)
          ? true
          : overwrite?.deny.has(PermissionFlagsBits.UseExternalApps) ? false : null;
        return [channel.id, original];
      }))
      : settings.antiselfPermissions;

    if (disabling) {
      db.updateSetting(guild.id, 'antiselfPermissions', savedPermissions);
      db.updateSetting(guild.id, 'antiself', 1);
    }

    const failures = [];
    for (const channel of guild.channels.cache.values()) {
      try {
        const original = savedPermissions[channel.id];
        await channel.permissionOverwrites.edit(
          guild.id,
          { UseExternalApps: disabling ? false : original ?? null },
          { reason: disabling ? 'Lobster antiself enabled' : 'Lobster antiself restored' }
        );
      } catch (error) {
        failures.push(channel.name);
        console.error(`Could not update External Apps permission in #${channel.name}:`, error);
      }
    }

    if (!disabling && failures.length === 0) {
      db.updateSetting(guild.id, 'antiself', 0);
      db.updateSetting(guild.id, 'antiselfPermissions', {});
    }

    const description = failures.length
      ? `External Apps usage was ${disabling ? 'disabled' : 'restored'} where possible. Failed in: ${failures.join(', ')}.`
      : `External Apps usage has been **${disabling ? 'disabled' : 'restored'}** in all channels.`;
    const embed = new EmbedBuilder()
      .setColor(failures.length ? 0xd64545 : 0x5865f2)
      .setDescription(description);
    return isSlash ? interaction.reply({ embeds: [embed], ephemeral: failures.length > 0 }) : message.reply({ embeds: [embed] });
  }
};
