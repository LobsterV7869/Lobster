const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { resolveExpression } = require('../utils/expressions');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');
const { logModeration } = require('../utils/modlog');

const MAX_BYTES = 256 * 1024;

function friendlyError(error) {
  if (error?.code === 30008) return '📦 This server is full — you have hit the emoji limit.';
  if (error?.code === 50035) return '🙃 Discord rejected that emoji. Use letters, numbers and underscores (2-32 characters).';
  if (error?.status === 413 || /larger than|too large|File size/i.test(error?.message || '')) {
    return '📦 That image is too big. Emojis must be 256 KB or smaller.';
  }
  return error?.rawError?.message || error?.message || '🙃 Discord could not add that emoji — try a different image.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addemoji')
    .setDescription('Add a custom emoji to this server')
    .addStringOption(option => option.setName('name').setDescription('Emoji name, e.g. lovemc').setRequired(false))
    .addStringOption(option => option.setName('source').setDescription('Image URL or an existing emoji to copy'))
    .addAttachmentOption(option => option.setName('image').setDescription('Image file to upload')),
  aliases: ['addemote', 'stealemoji'],
  category: 'Utility',
  permissions: [PermissionFlagsBits.ManageGuildExpressions],
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  async run({ interaction, message, isSlash, args, guild, user }) {
    const input = await resolveExpression({
      tokens: isSlash ? [] : args,
      nameOption: isSlash ? interaction.options.getString('name') : null,
      sourceOption: isSlash ? interaction.options.getString('source') : null,
      imageOption: isSlash ? interaction.options.getAttachment('image') : null,
      message
    });

    const usage = '🖼️ Add a custom emoji:\n`l addemoji <name> <image/emoji>`\n-# Attach an image, or copy an existing emoji.';
    if (!input.name || !input.source) {
      return isSlash ? interaction.reply({ content: usage, ephemeral: true }) : message.reply(usage);
    }
    if (!/^[A-Za-z0-9_]{2,32}$/.test(input.name)) {
      const response = '✍️ The emoji name needs 2-32 characters: letters, numbers and underscores only.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (input.size && input.size > MAX_BYTES) {
      const response = '📦 That image is too big. Emojis must be 256 KB or smaller.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    try {
      const emoji = await guild.emojis.create({ attachment: input.source, name: input.name, reason: `Added by ${user.tag}` });
      const embed = new EmbedBuilder()
        .setColor(LOBSTER_BLUE)
        .setAuthor({ name: 'Lobster · Expressions', iconURL: guild.iconURL() || undefined })
        .setTitle('✅ Emoji added')
        .setDescription(`Added ${emoji} as \`:${emoji.name}:\`${emoji.animated ? ' (animated)' : ''}.`)
        .setThumbnail(emoji.imageURL({ size: 128 }))
        .setFooter({ text: LOBSTER_FOOTER });
      logModeration(guild, 'Emoji created', `${user} added the emoji ${emoji} (\`:${emoji.name}:\`).`);
      return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
    } catch (error) {
      const response = `⚠️ ${friendlyError(error)}`;
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
  }
};
