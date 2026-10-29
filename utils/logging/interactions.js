const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require('discord.js');
const {
  ID_PATTERN,
  MAX_IDS,
  cleanIds,
  getLogConfig,
  updateType,
  resetType
} = require('./config');
const { TYPE_MAP } = require('./categories');
const {
  PREFIX,
  buildPanel,
  buildDetail,
  ignoreModal,
  buildRemoveConfirm,
  buildRemoveChannels
} = require('./panel');
const { buildSetupEmbed } = require('./embeds');
const { setupLogChannels, removeLogs } = require('./setup');

const CONFIRM_TTL = 2 * 60 * 1000;

function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function expiredEmbed() {
  return new EmbedBuilder()
    .setColor(0x747f8d)
    .setDescription('This confirmation expired. Run `/logs` and start again.');
}

async function hasAccess(interaction) {
  if (!interaction.guild) {
    await interaction.reply(ephemeral('Logging controls only work in a server.'));
    return false;
  }
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply(ephemeral('You need the Manage Server permission to configure logging.'));
    return false;
  }
  return true;
}

async function checkOpener(interaction, opener) {
  if (interaction.user.id !== opener) {
    await interaction.reply(ephemeral('Only the person who opened this panel can use these controls. Run `/logs` to open your own.'));
    return false;
  }
  return true;
}

function parseIds(value) {
  return [...new Set(String(value || '').split(/[\s,]+/).map(item => item.trim()).filter(Boolean))];
}

function validateIds(ids, kind, guild) {
  if (ids.length > MAX_IDS) {
    throw new Error(`Keep each ignore list to ${MAX_IDS} IDs or fewer.`);
  }
  for (const id of ids) {
    if (!ID_PATTERN.test(id)) throw new Error(`\`${id}\` is not a valid ${kind} ID.`);
    if (kind === 'channel' && !guild.channels.cache.has(id)) throw new Error(`Channel \`${id}\` was not found in this server.`);
    if (kind === 'role' && !guild.roles.cache.has(id)) throw new Error(`Role \`${id}\` was not found in this server.`);
  }
  return ids;
}

async function updateDetail(interaction, typeKey, opener) {
  const type = TYPE_MAP[typeKey];
  if (!type) {
    await interaction.reply(ephemeral('That log type no longer exists.'));
    return;
  }
  const config = getLogConfig(interaction.guildId);
  await interaction.update(buildDetail(interaction.guild, config, type, opener));
}

function removalSummary(result) {
  const lines = ['Logging has been removed. Every log type is now disabled.'];
  if (result.deleted.length) lines.push(`Deleted ${result.deleted.length} channel${result.deleted.length === 1 ? '' : 's'} created by Lobster.`);
  if (result.failed.length) lines.push(`${result.failed.length} channel${result.failed.length === 1 ? '' : 's'} could not be deleted. Check Lobster’s permissions.`);
  if (!result.deleted.length && !result.failed.length) lines.push('No Lobster-created channels were deleted.');
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(lines.join('\n'))
    .setTimestamp();
}

async function handleLogInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith(`${PREFIX}:`)) return false;

  try {
    if (!await hasAccess(interaction)) return true;
    const parts = customId.split(':');
    const action = parts[1];

    if (interaction.isModalSubmit() && action === 'ignoremodal') {
      const typeKey = parts[2];
      const opener = parts[3];
      if (!await checkOpener(interaction, opener)) return true;
      const type = TYPE_MAP[typeKey];
      if (!type) {
        await interaction.reply(ephemeral('That log type no longer exists.'));
        return true;
      }
      const ignoredChannels = validateIds(parseIds(interaction.fields.getTextInputValue('channels')), 'channel', interaction.guild);
      const ignoredRoles = validateIds(parseIds(interaction.fields.getTextInputValue('roles')), 'role', interaction.guild);
      const ignoredUsers = validateIds(parseIds(interaction.fields.getTextInputValue('users')), 'user', interaction.guild);
      updateType(interaction.guildId, typeKey, { ignoredChannels, ignoredRoles, ignoredUsers });
      const config = getLogConfig(interaction.guildId);
      await interaction.update(buildDetail(interaction.guild, config, type, opener));
      return true;
    }

    if (interaction.isStringSelectMenu() && (action === 'view' || action === 'config')) {
      const opener = parts[2];
      if (!await checkOpener(interaction, opener)) return true;
      const typeKey = interaction.values[0];
      const type = TYPE_MAP[typeKey];
      if (!type) {
        await interaction.reply(ephemeral('That log type no longer exists.'));
        return true;
      }
      const config = getLogConfig(interaction.guildId);
      await interaction.update(buildDetail(interaction.guild, config, type, opener));
      return true;
    }

    if (interaction.isChannelSelectMenu() && action === 'channel') {
      const typeKey = parts[2];
      const opener = parts[3];
      if (!await checkOpener(interaction, opener)) return true;
      const channel = interaction.channels.first();
      if (!channel) {
        await interaction.reply(ephemeral('Select a text channel for this log type.'));
        return true;
      }
      updateType(interaction.guildId, typeKey, { channelId: channel.id });
      await updateDetail(interaction, typeKey, opener);
      return true;
    }

    if (interaction.isButton()) {
      if (action === 'toggle' || action === 'bots' || action === 'ignore' || action === 'reset') {
        const typeKey = parts[2];
        const opener = parts[3];
        if (!await checkOpener(interaction, opener)) return true;
        const type = TYPE_MAP[typeKey];
        if (!type) {
          await interaction.reply(ephemeral('That log type no longer exists.'));
          return true;
        }
        const config = getLogConfig(interaction.guildId);
        const typeConfig = config.types[typeKey];
        if (action === 'toggle') updateType(interaction.guildId, typeKey, { enabled: !typeConfig.enabled });
        if (action === 'bots') updateType(interaction.guildId, typeKey, { ignoreBots: !typeConfig.ignoreBots });
        if (action === 'reset') resetType(interaction.guildId, typeKey);
        if (action === 'ignore') {
          await interaction.showModal(ignoreModal(type, typeConfig, opener));
          return true;
        }
        await updateDetail(interaction, typeKey, opener);
        return true;
      }

      if (action === 'back' || action === 'refresh') {
        const opener = parts[2];
        if (!await checkOpener(interaction, opener)) return true;
        const config = getLogConfig(interaction.guildId);
        await interaction.update(buildPanel(interaction.guild, config, interaction.user));
        return true;
      }

      if (action === 'setup') {
        const opener = parts[2];
        if (!await checkOpener(interaction, opener)) return true;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const result = await setupLogChannels(interaction.guild);
          const config = getLogConfig(interaction.guildId);
          await interaction.editReply({ embeds: [buildSetupEmbed(result)] });
          await interaction.message.edit(buildPanel(interaction.guild, config, interaction.user)).catch(() => {});
        } catch (error) {
          await interaction.editReply({ content: error.message || 'Could not set up log channels.' });
        }
        return true;
      }

      if (action === 'remove') {
        const opener = parts[2];
        if (!await checkOpener(interaction, opener)) return true;
        const config = getLogConfig(interaction.guildId);
        await interaction.update(buildRemoveConfirm(interaction.guild, config, opener, Date.now()));
        return true;
      }

      if (action === 'removeconfirm') {
        const opener = parts[2];
        const timestamp = Number(parts[3]);
        if (!await checkOpener(interaction, opener)) return true;
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > CONFIRM_TTL) {
          await interaction.update({ embeds: [expiredEmbed()], components: [] });
          return true;
        }
        const config = getLogConfig(interaction.guildId);
        await interaction.update(buildRemoveChannels(interaction.guild, config, opener, timestamp));
        return true;
      }

      if (action === 'removecancel') {
        const opener = parts[2];
        if (!await checkOpener(interaction, opener)) return true;
        const config = getLogConfig(interaction.guildId);
        await interaction.update(buildPanel(interaction.guild, config, interaction.user));
        return true;
      }

      if (action === 'removechannels' || action === 'removekeep') {
        const opener = parts[2];
        const timestamp = Number(parts[3]);
        if (!await checkOpener(interaction, opener)) return true;
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > CONFIRM_TTL) {
          await interaction.update({ embeds: [expiredEmbed()], components: [] });
          return true;
        }
        await interaction.deferUpdate();
        try {
          const result = await removeLogs(interaction.guild, { deleteChannels: action === 'removechannels' });
          const config = getLogConfig(interaction.guildId);
          await interaction.editReply(buildPanel(interaction.guild, config, interaction.user));
          await interaction.followUp({ embeds: [removalSummary(result)], flags: MessageFlags.Ephemeral });
        } catch (error) {
          await interaction.followUp({ content: error.message || 'Could not remove logging.', flags: MessageFlags.Ephemeral });
        }
        return true;
      }
    }

    await interaction.reply(ephemeral('That logging control is not available.'));
    return true;
  } catch (error) {
    console.error('Logging panel interaction failed:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Something went wrong while updating logging.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply(ephemeral('Something went wrong while updating logging.'));
      }
    } catch {}
    return true;
  }
}

module.exports = { handleLogInteraction };
