const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');
const { roleHierarchyError } = require('../utils/moderation');

function emojiKey(value) {
  return value.match(/^<a?:[^:]+:(\d+)>$/)?.[1] || value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Configure roles members can choose with reactions')
    .addSubcommand(command => command
      .setName('add')
      .setDescription('Add a reaction role to a message')
      .addChannelOption(option => option.setName('channel').setDescription('Message channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption(option => option.setName('message_id').setDescription('ID of the message').setRequired(true).setMinLength(17).setMaxLength(20))
      .addStringOption(option => option.setName('emoji').setDescription('Unicode or server emoji').setRequired(true).setMaxLength(100))
      .addRoleOption(option => option.setName('role').setDescription('Role to grant/remove').setRequired(true)))
    .addSubcommand(command => command
      .setName('remove')
      .setDescription('Remove a reaction role')
      .addStringOption(option => option.setName('message_id').setDescription('ID of the message').setRequired(true).setMinLength(17).setMaxLength(20))
      .addStringOption(option => option.setName('emoji').setDescription('Unicode or server emoji').setRequired(true).setMaxLength(100)))
    .addSubcommand(command => command
      .setName('list')
      .setDescription('List reaction roles on a message')
      .addStringOption(option => option.setName('message_id').setDescription('ID of the message').setRequired(true).setMinLength(17).setMaxLength(20))),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
  async run({ interaction, message, isSlash, args, guild, member }) {
    const action = isSlash ? interaction.options.getSubcommand() : args[0]?.toLowerCase();
    let channel;
    let messageId;
    let emoji;
    let role;
    if (isSlash) {
      channel = interaction.options.getChannel('channel');
      messageId = interaction.options.getString('message_id');
      emoji = interaction.options.getString('emoji');
      role = interaction.options.getRole('role');
    } else {
      channel = message.mentions.channels.first();
      messageId = args.find(arg => /^\d{17,20}$/.test(arg));
      emoji = args.find(arg => /^(?:<a?:[^:]+:\d+>|\p{Extended_Pictographic})/u.test(arg));
      role = message.mentions.roles.first();
    }

    if (!['add', 'remove', 'list'].includes(action)) {
      const response = 'Use `reactionrole add #channel MESSAGE_ID 😀 @Role`, `reactionrole remove MESSAGE_ID 😀`, or `reactionrole list MESSAGE_ID`.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (!messageId || !/^\d{17,20}$/.test(messageId)) {
      const response = 'Usage: l reactionrole add <message id> <emoji> <@role>';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    if (action === 'add') {
      if (!channel && !isSlash) {
        const response = 'Mention the channel containing the message.';
        return message.reply(response);
      }
      if (!emoji || !role) {
        const response = 'Choose an emoji and role.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      const hierarchyError = roleHierarchyError(member, role, guild);
      if (hierarchyError) {
        return isSlash ? interaction.reply({ content: hierarchyError, ephemeral: true }) : message.reply(hierarchyError);
      }
      const targetChannel = channel || message.mentions.channels.first();
      if (!targetChannel?.isTextBased()) {
        const response = 'Choose a text channel containing the message.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      const targetMessage = await targetChannel.messages.fetch(messageId).catch(error => {
        if (error.code === 10008 || error.code === 10003) return null;
        throw error;
      });
      if (!targetMessage) {
        const response = 'I could not find that message in the selected channel.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      const key = emojiKey(emoji);
      await targetMessage.react(emoji);
      db.setReactionRole(guild.id, messageId, key, role.id, targetChannel.id);
      const response = `React with ${emoji} on [this message](${targetMessage.url}) to get ${role}.`;
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    if (!emoji && action === 'remove' && !isSlash) {
      emoji = args.find(arg => /^(?:<a?:[^:]+:\d+>|\p{Extended_Pictographic})/u.test(arg));
    }
    const mappings = db.getReactionRoles(guild.id, messageId);
    if (action === 'remove') {
      if (!emoji || !db.removeReactionRole(guild.id, messageId, emojiKey(emoji))) {
        const response = 'That reaction role was not found.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      const response = 'Reaction role removed.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const description = Object.entries(mappings).map(([key, mapping]) =>
      `${key.match(/^\d+$/) ? `<:role:${key}>` : key} → <@&${mapping.roleId}>`
    ).join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x5BA6FB)
      .setTitle('Reaction roles')
      .setDescription(description || 'No reaction roles are configured on this message.');
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
