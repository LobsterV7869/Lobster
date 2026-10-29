const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  LOG_TYPES,
  TYPE_MAP,
  PANEL_COLOR
} = require('./categories');
const {
  buildPanelEmbed,
  buildTypeDetailEmbed,
  buildRemoveConfirmEmbed,
  buildRemoveChannelsEmbed
} = require('./embeds');

const PREFIX = 'lobster_logs';

function short(value, max = 100) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function viewId(opener) {
  return `${PREFIX}:view:${opener}`;
}

function configSelectId(opener) {
  return `${PREFIX}:config:${opener}`;
}

function refreshId(opener) {
  return `${PREFIX}:refresh:${opener}`;
}

function setupId(opener) {
  return `${PREFIX}:setup:${opener}`;
}

function removeId(opener) {
  return `${PREFIX}:remove:${opener}`;
}

function channelId(typeKey, opener) {
  return `${PREFIX}:channel:${typeKey}:${opener}`;
}

function toggleId(typeKey, opener) {
  return `${PREFIX}:toggle:${typeKey}:${opener}`;
}

function botsId(typeKey, opener) {
  return `${PREFIX}:bots:${typeKey}:${opener}`;
}

function ignoreId(typeKey, opener) {
  return `${PREFIX}:ignore:${typeKey}:${opener}`;
}

function resetId(typeKey, opener) {
  return `${PREFIX}:reset:${typeKey}:${opener}`;
}

function backId(opener) {
  return `${PREFIX}:back:${opener}`;
}

function removeConfirmId(opener, timestamp) {
  return `${PREFIX}:removeconfirm:${opener}:${timestamp}`;
}

function removeCancelId(opener, timestamp) {
  return `${PREFIX}:removecancel:${opener}:${timestamp}`;
}

function removeChannelsId(opener, timestamp) {
  return `${PREFIX}:removechannels:${opener}:${timestamp}`;
}

function removeKeepId(opener, timestamp) {
  return `${PREFIX}:removekeep:${opener}:${timestamp}`;
}

function ignoreModalId(typeKey, opener) {
  return `${PREFIX}:ignoremodal:${typeKey}:${opener}`;
}

function typeSelect(id, placeholder) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .addOptions(LOG_TYPES.map(type => new StringSelectMenuOptionBuilder()
      .setLabel(short(`${type.emoji} ${type.label}`, 100))
      .setDescription(short(type.description, 100))
      .setValue(type.key)));
}

function panelComponents(opener) {
  return [
    new ActionRowBuilder().addComponents(typeSelect(viewId(opener), 'Logs')),
    new ActionRowBuilder().addComponents(typeSelect(configSelectId(opener), 'Configure Logs')),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(refreshId(opener)).setLabel('Refresh Menu').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(setupId(opener)).setLabel('Set Up Log Channels').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(removeId(opener)).setLabel('Remove Logs').setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildPanel(guild, config, requestedBy) {
  const opener = requestedBy.id;
  return {
    embeds: [buildPanelEmbed(guild, config, requestedBy)],
    components: panelComponents(opener)
  };
}

function detailComponents(guild, config, type, opener) {
  const typeConfig = config.types[type.key];
  const current = typeConfig.channelId ? guild.channels.cache.get(typeConfig.channelId) : null;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(channelId(type.key, opener))
    .setPlaceholder(short(current ? `Channel: #${current.name}` : 'Select a log channel', 150))
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  return [
    new ActionRowBuilder().addComponents(channelSelect),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(toggleId(type.key, opener))
        .setLabel(typeConfig.enabled ? 'Disable log' : 'Enable log')
        .setStyle(typeConfig.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(botsId(type.key, opener))
        .setLabel(`Ignore bots: ${typeConfig.ignoreBots ? 'On' : 'Off'}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ignoreId(type.key, opener))
        .setLabel('Edit ignore lists')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(resetId(type.key, opener)).setLabel('Reset this log').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(backId(opener)).setLabel('Back to panel').setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildDetail(guild, config, type, opener) {
  return {
    embeds: [buildTypeDetailEmbed(guild, config, type)],
    components: detailComponents(guild, config, type, opener)
  };
}

function ignoreModal(type, typeConfig, opener) {
  const channelInput = new TextInputBuilder()
    .setCustomId('channels')
    .setLabel('Ignored channel IDs')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Comma-separated channel IDs, for example 123456789012345678')
    .setValue(typeConfig.ignoredChannels.join(', ').slice(0, 4000));
  const roleInput = new TextInputBuilder()
    .setCustomId('roles')
    .setLabel('Ignored role IDs')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Comma-separated role IDs')
    .setValue(typeConfig.ignoredRoles.join(', ').slice(0, 4000));
  const userInput = new TextInputBuilder()
    .setCustomId('users')
    .setLabel('Ignored user IDs')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Comma-separated user IDs')
    .setValue(typeConfig.ignoredUsers.join(', ').slice(0, 4000));

  return new ModalBuilder()
    .setCustomId(ignoreModalId(type.key, opener))
    .setTitle(short(`Ignore lists: ${type.label}`, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(channelInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(userInput)
    );
}

function buildRemoveConfirm(guild, config, opener, timestamp) {
  return {
    embeds: [buildRemoveConfirmEmbed()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(removeConfirmId(opener, timestamp)).setLabel('Confirm removal').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(removeCancelId(opener, timestamp)).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    )]
  };
}

function buildRemoveChannels(guild, config, opener, timestamp) {
  return {
    embeds: [buildRemoveChannelsEmbed()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(removeChannelsId(opener, timestamp)).setLabel('Delete channels').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(removeKeepId(opener, timestamp)).setLabel('Keep channels').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(removeCancelId(opener, timestamp)).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    )]
  };
}

module.exports = {
  PREFIX,
  TYPE_MAP,
  PANEL_COLOR,
  viewId,
  configSelectId,
  channelId,
  toggleId,
  botsId,
  ignoreId,
  resetId,
  backId,
  ignoreModalId,
  buildPanel,
  buildDetail,
  ignoreModal,
  buildRemoveConfirm,
  buildRemoveChannels
};
