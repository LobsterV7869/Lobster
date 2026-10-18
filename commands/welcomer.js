const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const db = require('../utils/database');
const { welcomeEmbed } = require('../utils/welcome');

const options = [
  ['--channel', 'welcomeChannel'],
  ['--title', 'welcomeTitle'],
  ['--message', 'welcomeMessage'],
  ['--image', 'welcomeImage'],
  ['--thumbnail', 'welcomeThumbnail'],
  ['--color', 'welcomeColor'],
  ['--footer', 'welcomeFooter'],
  ['--address', 'welcomeServerAddress']
];

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
    .setName('welcomer')
    .setDescription('Design and preview the new-member welcome card')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel for welcome cards')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption(option => option
      .setName('farewell_channel')
      .setDescription('Optional channel for member departure cards')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(option => option.setName('title').setDescription('Card heading').setMaxLength(256))
    .addStringOption(option => option.setName('message').setDescription('Welcome text; supports {user}, {server}, {membercount}, {created}, {joined}').setMaxLength(4000))
    .addStringOption(option => option.setName('image').setDescription('Large banner image URL').setMaxLength(500))
    .addStringOption(option => option.setName('thumbnail').setDescription('Small thumbnail image URL').setMaxLength(500))
    .addStringOption(option => option.setName('color').setDescription('Hex color, e.g. #5BA6FB').setMaxLength(7))
    .addStringOption(option => option.setName('footer').setDescription('Footer; supports {membercount}').setMaxLength(2048))
    .addStringOption(option => option.setName('address').setDescription('Optional game/server address').setMaxLength(100))
    .addStringOption(option => option.setName('farewell_message').setDescription('Departure text; supports {user}, {server}, {membercount}').setMaxLength(4000))
    .addBooleanOption(option => option.setName('farewell_enabled').setDescription('Enable or disable departure cards'))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable welcome cards'))
    .addBooleanOption(option => option.setName('preview').setDescription('Preview your welcome card'))
    .addBooleanOption(option => option.setName('reset').setDescription('Reset card design to defaults')),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  async run({ interaction, message, isSlash, args, guild, member }) {
    const settings = db.getSettings(guild.id);
    const parsed = {};
    const botPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    let requestedState;
    let farewellState;
    let preview = false;
    let reset = false;

    if (isSlash) {
      const channel = interaction.options.getChannel('channel');
      if (channel) parsed.welcomeChannel = channel.id;
      const farewellChannel = interaction.options.getChannel('farewell_channel');
      if (farewellChannel) parsed.farewellChannel = farewellChannel.id;
      for (const [option, key] of [
        ['title', 'welcomeTitle'],
        ['message', 'welcomeMessage'],
        ['image', 'welcomeImage'],
        ['thumbnail', 'welcomeThumbnail'],
        ['color', 'welcomeColor'],
        ['footer', 'welcomeFooter'],
        ['address', 'welcomeServerAddress']
      ]) {
        const value = interaction.options.getString(option);
        if (value !== null) parsed[key] = value;
      }
      const farewellMessage = interaction.options.getString('farewell_message');
      if (farewellMessage !== null) parsed.farewellMessage = farewellMessage;
      requestedState = interaction.options.getBoolean('enabled');
      farewellState = interaction.options.getBoolean('farewell_enabled');
      preview = interaction.options.getBoolean('preview') === true;
      reset = interaction.options.getBoolean('reset') === true;
    } else {
      const channelFlag = args.indexOf('--channel');
      const channelArgument = channelFlag === -1 ? null : args[channelFlag + 1]?.replace(/[<#>]/g, '');
      const channel = message.mentions.channels.first()
        || guild.channels.cache.get(channelArgument)
        || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)));
      if (channel) parsed.welcomeChannel = channel.id;
      const farewellChannelIndex = args.indexOf('--farewell-channel');
      if (farewellChannelIndex !== -1) {
        const farewellChannelId = args[farewellChannelIndex + 1]?.replace(/[<#>]/g, '');
        if (guild.channels.cache.has(farewellChannelId)) parsed.farewellChannel = farewellChannelId;
      }
      for (const [flag, key] of options.slice(1)) {
        const index = args.indexOf(flag);
        if (index !== -1) {
          const nextFlag = args.findIndex((arg, position) => position > index && arg.startsWith('--'));
          parsed[key] = args.slice(index + 1, nextFlag === -1 ? args.length : nextFlag).join(' ');
        }
      }
      const stateIndex = args.indexOf('--enabled');
      const stateArgument = stateIndex === -1
        ? ['on', 'off', 'enable', 'disable', 'enabled', 'disabled'].includes(args[0]?.toLowerCase()) ? args[0] : null
        : args[stateIndex + 1];
      if (stateArgument) {
        if (['on', 'true', 'yes', 'enable', 'enabled'].includes(stateArgument.toLowerCase())) requestedState = true;
        else if (['off', 'false', 'no', 'disable', 'disabled'].includes(stateArgument.toLowerCase())) requestedState = false;
        else {
          const response = 'Use `--enabled on` or `--enabled off`.';
          return message.reply(response);
        }
      } else if (args.length === 0) {
        requestedState = !settings.welcomer;
      }
      const farewellStateIndex = args.indexOf('--farewell-enabled');
      if (farewellStateIndex !== -1) {
        const value = args[farewellStateIndex + 1]?.toLowerCase();
        if (['on', 'true', 'yes', 'enable', 'enabled'].includes(value)) farewellState = true;
        else if (['off', 'false', 'no', 'disable', 'disabled'].includes(value)) farewellState = false;
        else return message.reply('Use `--farewell-enabled on` or `--farewell-enabled off`.');
      }
      const farewellMessageIndex = args.indexOf('--farewell-message');
      if (farewellMessageIndex !== -1) {
        const nextFlag = args.findIndex((arg, index) => index > farewellMessageIndex && arg.startsWith('--'));
        parsed.farewellMessage = args.slice(farewellMessageIndex + 1, nextFlag === -1 ? args.length : nextFlag).join(' ');
      }
      preview = args.includes('--preview');
      reset = args.includes('--reset');
    }

    if (requestedState === true && !parsed.welcomeChannel && !settings.welcomeChannel) {
      const defaultChannel = isSlash ? interaction.channel : message.channel;
      if (defaultChannel?.isTextBased()) parsed.welcomeChannel = defaultChannel.id;
    }

    if (reset) {
      for (const [key, value] of Object.entries({
        welcomeTitle: 'A new member has arrived!',
        welcomeMessage: 'Welcome {user} to **{server}**! We are glad you are here.',
        welcomeImage: null,
        welcomeThumbnail: null,
        welcomeColor: '#5BA6FB',
        welcomeFooter: 'Member #{membercount}',
        welcomeServerAddress: null
      })) {
        db.updateSetting(guild.id, key, value);
        parsed[key] = value;
      }
    }

    const selectedWelcomeChannel = parsed.welcomeChannel || settings.welcomeChannel;
    const selectedFarewellChannel = parsed.farewellChannel || settings.farewellChannel || selectedWelcomeChannel;
    const welcomeTarget = guild.channels.cache.get(selectedWelcomeChannel);
    const farewellTarget = guild.channels.cache.get(selectedFarewellChannel);
    const configurationChanged = Object.keys(parsed).some(key =>
      !['farewellChannel', 'farewellMessage'].includes(key)
    );
    const welcomeWillEnable = requestedState === true || (
      requestedState !== false
      && configurationChanged
      && (!reset || parsed.welcomeChannel)
      && welcomeTarget
    );
    if (welcomeWillEnable && !welcomeTarget?.isTextBased()) {
      const response = 'Choose a text channel before enabling welcome cards.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (welcomeWillEnable && !welcomeTarget.permissionsFor(guild.members.me)?.has(botPermissions)) {
      const response = 'I need View Channel, Send Messages, and Embed Links in the welcome channel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (farewellState === true && !farewellTarget?.isTextBased()) {
      const response = 'Choose a departure channel before enabling farewell cards.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (farewellState === true && !farewellTarget.permissionsFor(guild.members.me)?.has(botPermissions)) {
      const response = 'I need View Channel, Send Messages, and Embed Links in the departure channel.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'welcomeChannel') {
        if (!guild.channels.cache.get(value)?.isTextBased()) {
          const response = 'Choose a text channel from this server.';
          return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
        }
        continue;
      }
      if (key === 'farewellChannel') {
        const channel = guild.channels.cache.get(value);
        if (!channel?.isTextBased()) {
          const response = 'Choose a departure channel from this server.';
          return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
        }
        continue;
      }
      const maxLengths = {
        welcomeTitle: 256,
        welcomeMessage: 4000,
        welcomeImage: 500,
        welcomeThumbnail: 500,
        welcomeColor: 7,
        welcomeFooter: 2048,
        welcomeServerAddress: 100,
        farewellMessage: 4000
      };
      if (typeof value === 'string' && value.length > maxLengths[key]) {
        const response = `${key.replace('welcome', '')} must be ${maxLengths[key]} characters or fewer.`;
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (typeof value === 'string' && !value.trim() && !['welcomeImage', 'welcomeThumbnail', 'welcomeServerAddress'].includes(key)) {
        const response = 'Welcome card text fields cannot be empty.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (['welcomeImage', 'welcomeThumbnail'].includes(key) && value && !validUrl(value)) {
        const response = `\`${key === 'welcomeImage' ? 'image' : 'thumbnail'}\` must be a valid HTTP or HTTPS URL.`;
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (key === 'welcomeColor' && !/^#[\da-f]{6}$/i.test(value)) {
        const response = 'Color must be a six-digit hex value such as `#5BA6FB`.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }
    if (farewellState === true && !parsed.farewellChannel && !settings.farewellChannel && selectedFarewellChannel) {
      parsed.farewellChannel = selectedFarewellChannel;
    }
    if (parsed.welcomeChannel) db.updateSetting(guild.id, 'welcomeChannel', parsed.welcomeChannel);
    if (parsed.farewellChannel) db.updateSetting(guild.id, 'farewellChannel', parsed.farewellChannel);
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== 'welcomeChannel' && key !== 'farewellChannel') db.updateSetting(guild.id, key, value || null);
    }

    if (requestedState === false) db.updateSetting(guild.id, 'welcomer', 0);
    else if (requestedState === true || (
      configurationChanged
      && (!reset || parsed.welcomeChannel)
      && guild.channels.cache.get(selectedWelcomeChannel)
    )) {
      db.updateSetting(guild.id, 'welcomer', 1);
    }
    if (farewellState !== undefined && farewellState !== null) {
      db.updateSetting(guild.id, 'farewellEnabled', Number(farewellState));
    }

    const updatedSettings = db.getSettings(guild.id);
    if (preview) {
      const embed = welcomeEmbed(member, updatedSettings);
      return isSlash
        ? interaction.reply({ content: 'Welcome card preview', embeds: [embed], ephemeral: true })
        : message.reply({ content: 'Welcome card preview', embeds: [embed] });
    }

    const active = Boolean(updatedSettings.welcomer);
    const channel = updatedSettings.welcomeChannel
      ? guild.channels.cache.get(updatedSettings.welcomeChannel)
      : null;
    const status = new EmbedBuilder()
      .setColor(active ? updatedSettings.welcomeColor : 0x747f8d)
      .setTitle('Welcome cards')
      .setDescription(
        `${active ? 'Enabled' : 'Disabled'}${channel ? ` in ${channel}` : ''}.\n` +
        'Customize title, message, banner, thumbnail, color, footer, and optional server address. ' +
        'Use `{user}`, `{username}`, `{server}`, `{membercount}`, `{created}`, and `{joined}` in text.'
      )
      .addFields({
        name: 'Prefix command',
        value: `\`${updatedSettings.prefix} welcomer [channel] --title "..." --message "..." --image <url>\``
      }, {
        name: 'Farewell cards',
        value: `**${updatedSettings.farewellEnabled ? 'Enabled' : 'Disabled'}**${updatedSettings.farewellChannel ? ` in <#${updatedSettings.farewellChannel}>` : ''}. Configure with \`farewell_enabled\` and \`farewell_message\`.`
      });
    return isSlash
      ? interaction.reply({ embeds: [status], ephemeral: true })
      : message.reply({ embeds: [status] });
  }
};
