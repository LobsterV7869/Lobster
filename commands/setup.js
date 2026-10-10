const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../utils/database');
const { stylePayload } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create a ready-to-use starter layout for your server'),
  category: 'General',
  permissions: [PermissionFlagsBits.Administrator],
  botPermissions: [
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.SendMessages
  ],
  async run({ interaction, message, isSlash, guild }) {
    let progressMessage;
    if (isSlash) await interaction.deferReply({ ephemeral: true });
    else progressMessage = await message.reply('Setting up your starter layout…');

    const getOrCreateRole = async (name, color) => {
      let role = guild.roles.cache.find(existing => existing.name === name);
      if (!role) {
        role = await guild.roles.create({ name, color, reason: 'Lobster starter server setup' });
      }
      return role;
    };
    const getOrCreateChannel = async (name, category, options = {}) => {
      let channel = guild.channels.cache.find(existing =>
        existing.parentId === category.id && existing.name === name
      );
      if (!channel) {
        channel = await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: category.id,
          ...options,
          reason: 'Lobster starter server setup'
        });
      }
      return channel;
    };

    const moderator = await getOrCreateRole('Moderator', 0xd64545);
    const memberRole = await getOrCreateRole('Member', 0x5865f2);
    let category = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory && channel.name === 'lobster'
    );
    if (!category) {
      category = await guild.channels.create({
        name: 'lobster',
        type: ChannelType.GuildCategory,
        reason: 'Lobster starter server setup'
      });
    }

    const welcomeChannel = await getOrCreateChannel('welcome', category, {
      topic: 'Welcome new members here.'
    });
    await getOrCreateChannel('rules', category, { topic: 'Server rules.' });
    await getOrCreateChannel('counting', category, { topic: 'Enable counting with /counting.' });
    const supportChannel = await getOrCreateChannel('support', category, {
      topic: 'Open a private support ticket using the panel.'
    });
    const logsChannel = await getOrCreateChannel('logs', category, {
      topic: 'Staff-only server logs.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: moderator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });
    const transcriptChannel = await getOrCreateChannel('ticket-transcripts', category, {
      topic: 'Private ticket transcripts for staff.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: moderator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
    await logsChannel.permissionOverwrites.edit(guild.members.me.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true
    }, { reason: 'Allow Lobster to send configured event logs' });
    await transcriptChannel.permissionOverwrites.edit(guild.id, {
      ViewChannel: false
    }, { reason: 'Keep ticket transcripts private to staff' });
    await transcriptChannel.permissionOverwrites.edit(moderator.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }, { reason: 'Allow staff to review ticket transcripts' });
    await transcriptChannel.permissionOverwrites.edit(guild.members.me.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      AttachFiles: true,
      ReadMessageHistory: true
    }, { reason: 'Allow Lobster to save ticket transcripts' });

    const settings = db.getSettings(guild.id);
    let ticketCategory = guild.channels.cache.get(settings.ticketCategory);
    if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
      ticketCategory = await guild.channels.create({
        name: 'support-tickets',
        type: ChannelType.GuildCategory,
        reason: 'Lobster starter ticket setup'
      });
    }

    db.updateSetting(guild.id, 'welcomeChannel', welcomeChannel.id);
    db.updateSetting(guild.id, 'welcomer', 1);
    db.updateSetting(guild.id, 'farewellChannel', welcomeChannel.id);
    db.updateSetting(guild.id, 'farewellEnabled', 1);
    db.updateSetting(guild.id, 'auditLogChannel', logsChannel.id);
    db.updateSetting(guild.id, 'eventLogsEnabled', true);
    if (memberRole.editable) db.updateSetting(guild.id, 'autorole', memberRole.id);
    db.updateSetting(guild.id, 'ticketChannel', supportChannel.id);
    db.updateSetting(guild.id, 'ticketCategory', ticketCategory.id);
    db.updateSetting(guild.id, 'ticketAdminRole', moderator.id);
    db.updateSetting(guild.id, 'ticketTranscriptChannel', transcriptChannel.id);

    const ticketEmbed = new EmbedBuilder()
      .setColor(settings.ticketColor || 0xff6b35)
      .setTitle(settings.ticketTitle || 'How can we help?')
      .setDescription(settings.ticketMessage || 'Need help? Click below to open a private support ticket.')
      .setFooter({ text: '🦞 Lobster' });
    if (settings.ticketImage) ticketEmbed.setImage(settings.ticketImage);
    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel(settings.ticketButtonLabel || 'Create a ticket')
        .setStyle(ButtonStyle.Primary)
    );
    const previousPanelChannel = guild.channels.cache.get(settings.ticketChannel);
    let existingPanel;
    if (settings.ticketPanelMessageId && previousPanelChannel?.messages) {
      existingPanel = await previousPanelChannel.messages.fetch(settings.ticketPanelMessageId).catch(error => {
        if (error.code !== 10008) throw error;
        return null;
      });
    }
    let ticketPanel;
    if (existingPanel && previousPanelChannel.id === supportChannel.id) {
      ticketPanel = await existingPanel.edit(stylePayload(module.exports, {
        embeds: [ticketEmbed],
        components: [panelRow]
      }, { guild, client: guild.client }));
    } else {
      ticketPanel = await supportChannel.send(stylePayload(module.exports, {
        embeds: [ticketEmbed],
        components: [panelRow]
      }, { guild, client: guild.client }));
      if (existingPanel) {
        await existingPanel.delete().catch(error => {
          console.error('Could not remove the previous ticket panel during setup:', error);
        });
      }
    }
    db.updateSetting(guild.id, 'ticketPanelMessageId', ticketPanel.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Your server is ready')
      .setDescription(
        `Created or checked the **#lobster** starter layout, with welcome, rules, counting, support, and private staff logs.\n\n` +
        `Welcome messages are on in ${welcomeChannel}; use \`/welcomer\` to customize the card. ` +
        `${memberRole.editable ? `New members receive ${memberRole}. ` : ''}` +
        `Support is ready in ${supportChannel}; transcripts go to ${transcriptChannel}. Customize both with \`/ticket-panel\`.`
      )
      .addFields({
        name: 'Useful next steps',
        value: '`/help` · Browse commands\n`/levels` · Configure chat XP\n`/prefix` · Set a server prefix'
      });
    return isSlash
      ? interaction.editReply({ embeds: [embed] })
      : progressMessage.edit({ embeds: [embed], content: '' });
  }
};
