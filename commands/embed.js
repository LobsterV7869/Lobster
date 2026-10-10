const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { stylePayload } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom server announcement embed')
    .addStringOption(option => option.setName('message').setDescription('Embed message').setRequired(true).setMaxLength(4000))
    .addStringOption(option => option.setName('title').setDescription('Embed title').setMaxLength(256))
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel to send it in (defaults to this channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(option => option.setName('color').setDescription('Six-digit hex color').setMaxLength(7))
    .addStringOption(option => option.setName('image').setDescription('Optional image URL').setMaxLength(500))
    .addStringOption(option => option.setName('footer').setDescription('Optional footer').setMaxLength(2048)),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, channel }) {
    let title;
    let description;
    let color = '#FF6B35';
    let image;
    let footer;
    let target = channel;
    if (isSlash) {
      title = interaction.options.getString('title');
      description = interaction.options.getString('message');
      target = interaction.options.getChannel('channel') || channel;
      color = interaction.options.getString('color') || color;
      image = interaction.options.getString('image');
      footer = interaction.options.getString('footer');
    } else {
      const readFlag = flag => {
        const index = args.indexOf(flag);
        if (index === -1) return null;
        const nextFlag = args.findIndex((arg, position) => position > index && arg.startsWith('--'));
        return args.slice(index + 1, nextFlag === -1 ? args.length : nextFlag).join(' ');
      };
      title = readFlag('--title');
      description = readFlag('--message');
      color = readFlag('--color') || color;
      image = readFlag('--image');
      footer = readFlag('--footer');
      const mentionedChannel = message.mentions.channels.first();
      if (mentionedChannel) target = mentionedChannel;
    }

    if (!description?.trim()) {
      const response = 'Usage: `p embed --title "Server update" --message "Your announcement goes here."`.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (!/^#[\da-f]{6}$/i.test(color)) {
      const response = 'Color must be a six-digit hex value, such as `#FF6B35`.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (image) {
      try {
        if (!['http:', 'https:'].includes(new URL(image).protocol)) throw new Error('invalid protocol');
      } catch {
        const response = 'Image must be a valid HTTP or HTTPS URL.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }
    if (!target?.isTextBased() || !target.permissionsFor(target.guild.members.me)
      ?.has(PermissionFlagsBits.SendMessages)) {
      const response = 'I cannot send messages in that channel. Check my Send Messages permission.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `Lobster · ${guild.name} announcement` })
      .setDescription(description);
    if (title) embed.setTitle(title);
    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer });
    else embed.setFooter({ text: `Sent with Lobster · ${guild.name}` });
    if (isSlash) await interaction.reply({ content: `Announcement sent to ${target}.`, ephemeral: true });
    else await message.delete().catch(() => {});
    return target.send(stylePayload(module.exports, {
      embeds: [embed],
      allowedMentions: { parse: [] }
    }, { guild, client: guild.client }));
  }
};
