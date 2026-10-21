const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { resolveExpression, sanitizeName } = require('../utils/expressions');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');
const { logModeration } = require('../utils/modlog');

const MAX_BYTES = 512 * 1024;

function friendlyError(error) {
  if (error?.code === 30039) return 'This server has reached its maximum number of stickers.';
  if (error?.code === 50035) return 'Discord rejected that sticker. Use a PNG, APNG or GIF at 320x320 (512x512 max) and a 2-30 character name.';
  if (error?.status === 413 || /larger than|too large|File size/i.test(error?.message || '')) {
    return 'That file is too large. Stickers must be 512 KB or smaller.';
  }
  return error?.rawError?.message || error?.message || 'Discord could not add that sticker.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addsticker')
    .setDescription('Add a custom sticker to this server')
    .addStringOption(option => option.setName('name').setDescription('Sticker name, e.g. laughingdog').setRequired(false))
    .addStringOption(option => option.setName('tags').setDescription('A related emoji for search, e.g. 😂'))
    .addStringOption(option => option.setName('description').setDescription('Short description (2-100 characters)').setMaxLength(100))
    .addStringOption(option => option.setName('source').setDescription('Image URL (PNG/APNG/GIF)'))
    .addAttachmentOption(option => option.setName('image').setDescription('Sticker file to upload')),
  aliases: ['addstiker', 'stealsticker'],
  category: 'Utility',
  permissions: [PermissionFlagsBits.ManageGuildExpressions],
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  async run({ interaction, message, isSlash, args, guild, user }) {
    const nameOption = isSlash ? interaction.options.getString('name') : null;
    const tags = isSlash ? interaction.options.getString('tags') : null;
    const description = isSlash ? interaction.options.getString('description') : null;

    const input = await resolveExpression({
      tokens: isSlash ? [] : args,
      nameOption,
      sourceOption: isSlash ? interaction.options.getString('source') : null,
      imageOption: isSlash ? interaction.options.getAttachment('image') : null,
      message,
      allowSticker: true
    });

    const name = input.name || sanitizeName(nameOption);
    const usage = 'Add a sticker name and an image. Example: `addsticker :laughingdog:` with a PNG attached, or reply to a sticker with `addsticker laughingdog`.';
    if (!name || !input.source) {
      return isSlash ? interaction.reply({ content: usage, ephemeral: true }) : message.reply(usage);
    }
    if (!/^[A-Za-z0-9_ ]{2,30}$/.test(name)) {
      const response = 'The sticker name must be 2-30 characters.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (input.size && input.size > MAX_BYTES) {
      const response = 'That file is too large. Stickers must be 512 KB or smaller.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    try {
      const sticker = await guild.stickers.create({
        file: input.source,
        name,
        tags: tags || '😀',
        description: description && description.length >= 2 ? description : undefined,
        reason: `Added by ${user.tag}`
      });
      const embed = new EmbedBuilder()
        .setColor(LOBSTER_BLUE)
        .setAuthor({ name: 'Lobster · Expressions', iconURL: guild.iconURL() || undefined })
        .setTitle('✅ Sticker added')
        .setDescription(`Added the sticker **${sticker.name}**. It is now available in this server's sticker picker.`)
        .setThumbnail(sticker.url)
        .setFooter({ text: LOBSTER_FOOTER });
      logModeration(guild, 'Sticker created', `${user} added the sticker **${sticker.name}**.`);
      return isSlash ? interaction.reply({ embeds: [embed] }) : message.reply({ embeds: [embed] });
    } catch (error) {
      const response = `⚠️ ${friendlyError(error)}`;
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
  }
};
