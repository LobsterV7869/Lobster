const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const db = require('../utils/database');
const { stylePayload } = require('../utils/command-style');

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Design or update the server support ticket panel')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel where the panel appears')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption(option => option.setName('staff_role').setDescription('Role that can view and handle tickets'))
    .addChannelOption(option => option
      .setName('category')
      .setDescription('Category where new tickets are created')
      .addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(option => option
      .setName('transcript_channel')
      .setDescription('Private channel where closed ticket transcripts are sent')
      .addChannelTypes(ChannelType.GuildText))
    .addBooleanOption(option => option
      .setName('transcript_enabled')
      .setDescription('Save a transcript when a ticket is closed'))
    .addStringOption(option => option.setName('title').setDescription('Panel heading').setMaxLength(256))
    .addStringOption(option => option.setName('message').setDescription('Panel description').setMaxLength(4000))
    .addStringOption(option => option.setName('button').setDescription('Button label').setMaxLength(80))
    .addStringOption(option => option.setName('image').setDescription('Panel image URL').setMaxLength(500))
    .addStringOption(option => option.setName('color').setDescription('Embed color, e.g. #FF6B35').setMaxLength(7))
    .addStringOption(option => option.setName('prompt').setDescription('Opening message inside each ticket').setMaxLength(1000)),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const updates = {};
    let targetChannel;
    let staffRole;
    let category;
    let transcriptChannel = guild.channels.cache.get(settings.ticketTranscriptChannel) || null;
    let transcriptEnabled = Boolean(settings.ticketTranscriptChannel);

    if (isSlash) {
      targetChannel = interaction.options.getChannel('channel')
        || guild.channels.cache.get(settings.ticketChannel)
        || interaction.channel;
      staffRole = interaction.options.getRole('staff_role')
        || guild.roles.cache.get(settings.ticketAdminRole);
      category = interaction.options.getChannel('category');
      const transcriptChannelOption = interaction.options.getChannel('transcript_channel');
      if (transcriptChannelOption) {
        transcriptChannel = transcriptChannelOption;
        transcriptEnabled = true;
      }
      const transcriptEnabledOption = interaction.options.getBoolean('transcript_enabled');
      if (transcriptEnabledOption !== null) transcriptEnabled = transcriptEnabledOption;
      for (const [option, key] of [
        ['title', 'ticketTitle'],
        ['message', 'ticketMessage'],
        ['button', 'ticketButtonLabel'],
        ['image', 'ticketImage'],
        ['color', 'ticketColor'],
        ['prompt', 'ticketPrompt']
      ]) {
        const value = interaction.options.getString(option);
        if (value !== null) updates[key] = value;
      }
    } else {
      const mentionedChannel = message.mentions.channels.first();
      const mentionedRole = message.mentions.roles.first();
      targetChannel = mentionedChannel
        || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg) && guild.channels.cache.get(arg).isTextBased()))
        || guild.channels.cache.get(settings.ticketChannel)
        || message.channel;
      staffRole = mentionedRole
        || guild.roles.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.roles.cache.has(arg)))
        || guild.roles.cache.get(settings.ticketAdminRole);
      const categoryIndex = args.indexOf('--category');
      if (categoryIndex !== -1) {
        category = guild.channels.cache.get(args[categoryIndex + 1]);
      }
      const transcriptIndex = args.indexOf('--transcript-channel');
      if (transcriptIndex !== -1) {
        const transcriptValue = args[transcriptIndex + 1];
        if (transcriptValue === 'off') {
          transcriptEnabled = false;
          transcriptChannel = null;
        } else {
          const transcriptChannelId = transcriptValue?.match(/\d{17,20}/)?.[0];
          transcriptChannel = guild.channels.cache.get(transcriptChannelId) || null;
          transcriptEnabled = true;
        }
      }
      for (const [flag, key] of [
        ['--title', 'ticketTitle'],
        ['--message', 'ticketMessage'],
        ['--button', 'ticketButtonLabel'],
        ['--image', 'ticketImage'],
        ['--color', 'ticketColor'],
        ['--prompt', 'ticketPrompt']
      ]) {
        const index = args.indexOf(flag);
        if (index !== -1) {
          const nextFlag = args.findIndex((arg, position) => position > index && arg.startsWith('--'));
          updates[key] = args.slice(index + 1, nextFlag === -1 ? args.length : nextFlag).join(' ');
        }
      }
    }

    if (!staffRole || staffRole.id === guild.id || staffRole.managed) {
      const response = 'Choose a regular staff role (not @everyone or an integration-managed role). Example: `/ticket-panel staff_role:@Support`.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (!targetChannel?.isTextBased() || !targetChannel.messages) {
      const response = 'Choose a text channel for the panel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (category && category.type !== ChannelType.GuildCategory) {
      const response = 'The ticket category must be a server category channel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (transcriptEnabled && (!transcriptChannel?.isTextBased() || transcriptChannel.type !== ChannelType.GuildText)) {
      const response = 'Choose a server text channel for ticket transcripts, or disable transcripts with `transcript_enabled:false`.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (transcriptEnabled && !transcriptChannel.permissionsFor(guild.members.me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
      const response = 'I need View Channel, Send Messages, and Attach Files permissions in the transcript channel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (transcriptEnabled && transcriptChannel.permissionsFor(guild.roles.everyone)
      ?.has(PermissionFlagsBits.ViewChannel)) {
      const response = 'Ticket transcripts can contain private conversations. Make the transcript channel staff-only before selecting it.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (!value.trim()) {
        const response = 'Panel text and button labels cannot be empty.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      const maxLengths = {
        ticketTitle: 256,
        ticketMessage: 4000,
        ticketButtonLabel: 80,
        ticketImage: 500,
        ticketColor: 7,
        ticketPrompt: 1000
      };
      if (value.length > maxLengths[key]) {
        const response = `That field must be ${maxLengths[key]} characters or fewer.`;
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (key === 'ticketColor' && !/^#[\da-f]{6}$/i.test(value)) {
        const response = 'Color must be a six-digit hex value such as `#FF6B35`.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (key === 'ticketImage' && !validUrl(value)) {
        const response = 'Panel image must be a valid HTTP or HTTPS URL.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }

    if (isSlash) await interaction.deferReply({ ephemeral: true });
    let ticketCategory = category || guild.channels.cache.get(settings.ticketCategory);
    if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
      ticketCategory = await guild.channels.create({
        name: 'support-tickets',
        type: ChannelType.GuildCategory,
        reason: 'Ticket system setup'
      });
    }
    const ticketSettings = {
      ...settings,
      ...updates,
      ticketAdminRole: staffRole.id,
      ticketCategory: ticketCategory.id,
      ticketChannel: targetChannel.id,
      ticketTranscriptChannel: transcriptEnabled ? transcriptChannel.id : null
    };
    const embed = new EmbedBuilder()
      .setColor(ticketSettings.ticketColor)
      .setTitle(ticketSettings.ticketTitle)
      .setDescription(ticketSettings.ticketMessage)
      .setFooter({ text: '🦞 Lobster' });
    if (ticketSettings.ticketImage) embed.setImage(ticketSettings.ticketImage);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel(ticketSettings.ticketButtonLabel)
        .setStyle(ButtonStyle.Primary)
    );

    for (const [key, value] of Object.entries(ticketSettings)) {
      if (key.startsWith('ticket')) db.updateSetting(guild.id, key, value);
    }

    let previousPanel;
    const savedPanelChannel = guild.channels.cache.get(settings.ticketChannel);
    if (settings.ticketPanelMessageId && savedPanelChannel?.messages) {
      previousPanel = await savedPanelChannel.messages.fetch(settings.ticketPanelMessageId).catch(error => {
        if (error.code !== 10008) throw error;
        return null;
      });
    }
    let panel;
    if (previousPanel && savedPanelChannel.id === targetChannel.id) {
      panel = await previousPanel.edit(stylePayload(module.exports, {
        embeds: [embed],
        components: [row]
      }, { guild, client: guild.client }));
    } else {
      panel = await targetChannel.send(stylePayload(module.exports, {
        embeds: [embed],
        components: [row]
      }, { guild, client: guild.client }));
      if (previousPanel && savedPanelChannel.id !== targetChannel.id) {
        await previousPanel.delete().catch(error => {
          console.error('Could not remove the previous ticket panel:', error);
        });
      }
      db.updateSetting(guild.id, 'ticketPanelMessageId', panel.id);
    }

    const transcriptStatus = transcriptEnabled ? ` Transcripts will be saved in ${transcriptChannel}.` : ' Ticket transcripts are disabled.';
    const response = `Ticket panel is ready in ${targetChannel}. Members can open a private ticket with the button.${transcriptStatus}`;
    return isSlash
      ? interaction.editReply(response)
      : message.reply(response);
  }
};
