const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

const LOG_TYPES = {
  "giriş-çıkış-log": { label: '🔮・giriş-çıkış-log', includes: 'Üye giriş ve çıkışları' },
  "mesaj-log": { label: '💬・mesaj-log', includes: 'Mesaj düzenleme ve silme işlemleri' },
  "isim-log": { label: '✨・isim-log', includes: 'Üye isim değişiklikleri' },
  "seviye-log": { label: '💠・seviye-log', includes: 'Seviye atlamaları' },
  "ban-log": { label: '⛔・ban-log', includes: 'Ban işlemleri' },
  "kick-log": { label: '👢・kick-log', includes: 'Kick işlemleri' },
  "jail-log": { label: '🚷・jail-log', includes: 'Jail işlemleri' },
  "talep-log": { label: '📞・talep-log', includes: 'Talep işlemleri' },
  "ceza-log": { label: '🚫・ceza-log', includes: 'Ceza işlemleri' },
  "mod-log": { label: '🔏・mod-log', includes: 'Moderasyon işlemleri' },
  "koruma-log": { label: '🛡️・koruma-log', includes: 'Koruma sistem uyarıları' },
  "davet-log": { label: '🔗・davet-log', includes: 'Davet logları' },
  "ses-log": { label: '🔉・ses-log', includes: 'Ses kanal hareketleri' },
  "emoji-log": { label: '🙂・emoji-log', includes: 'Emoji değişiklikleri' }
};

function parseState(value) {
  if (['on', 'enable', 'enabled', 'true'].includes(value?.toLowerCase())) return true;
  if (['off', 'disable', 'disabled', 'false'].includes(value?.toLowerCase())) return false;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('View or configure Lobster server event logs')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel that receives server logs')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option
      .setName('enabled')
      .setDescription('Enable or disable event logging'))
    .addStringOption(option => option
      .setName('category')
      .setDescription('Log category to enable or disable')
      .addChoices(...Object.entries(LOG_TYPES).map(([value, type]) => ({
        name: type.label,
        value
      }))))
    .addChannelOption(option => option
      .setName('category_channel')
      .setDescription('Optional dedicated channel for this category')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(option => option
      .setName('category_enabled')
      .setDescription('Enable or disable the selected log category'))
    .addBooleanOption(option => option
      .setName('clear_category_channel')
      .setDescription('Use the main log channel instead of a dedicated channel')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const selectedChannel = isSlash
      ? interaction.options.getChannel('channel')
      : message.mentions.channels.first()
        || guild.channels.cache.get(args.find(arg => /^\d{17,20}$/.test(arg) && guild.channels.cache.has(arg)));
    let selectedCategoryChannel = null;
    const updates = {};
    const channelUpdates = {};
    let loggingEnabled;

    if (isSlash) {
      loggingEnabled = interaction.options.getBoolean('enabled');
      const category = interaction.options.getString('category');
      const categoryEnabled = interaction.options.getBoolean('category_enabled');
      const categoryChannel = interaction.options.getChannel('category_channel');
      const clearCategoryChannel = interaction.options.getBoolean('clear_category_channel');
      selectedCategoryChannel = categoryChannel;
      if (category && categoryEnabled !== null) updates[category] = categoryEnabled;
      else if (!category && (categoryEnabled !== null || categoryChannel || clearCategoryChannel)) {
        const response = 'Choose a log category when changing its settings.';
        return interaction.reply({ content: response, ephemeral: true });
      }
      if (category && categoryChannel) channelUpdates[category] = categoryChannel.id;
      if (category && clearCategoryChannel) channelUpdates[category] = null;
      if ((categoryChannel || clearCategoryChannel) && category) updates[category] = true;
    } else {
      const category = args.find(arg => Object.hasOwn(LOG_TYPES, arg.toLowerCase()))?.toLowerCase();
      const state = args.map(parseState).find(value => value !== null);
      const hasOff = args.some(arg => ['off', 'disable', 'disabled'].includes(arg.toLowerCase()));
      if (category) {
        if (state !== null && state !== undefined) updates[category] = state;
        else if (args.some(arg => arg.toLowerCase() === 'default')) {
          channelUpdates[category] = null;
          updates[category] = true;
        } else if (selectedChannel) {
          channelUpdates[category] = selectedChannel.id;
          updates[category] = true;
        }
        else {
          const response = `${LOG_TYPES[category].label} logs are ${settings.eventLogTypes[category] ? 'enabled' : 'disabled'}.`;
          return message.reply(response);
        }
      } else if (hasOff) {
        loggingEnabled = false;
      } else if (args.some(arg => ['on', 'enable', 'enabled'].includes(arg.toLowerCase()))) {
        loggingEnabled = true;
      }
    }

    const targetChannel = selectedChannel || guild.channels.cache.get(settings.auditLogChannel);
    for (const channel of new Set([selectedChannel, selectedCategoryChannel].filter(Boolean))) {
      if (!channel.isTextBased()) {
        const response = 'Choose a text channel for event logs.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
      if (!channel.permissionsFor(guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ])) {
        const response = 'I need View Channel, Send Messages, and Embed Links in the selected log channel.';
        return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
      }
    }
    const hasDedicatedChannel = Object.values(settings.eventLogChannels).some(Boolean);
    if (loggingEnabled === true && !targetChannel && !hasDedicatedChannel) {
      const response = 'Choose a log channel first.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    if (selectedChannel && !Object.keys(channelUpdates).length) {
      db.updateSetting(guild.id, 'auditLogChannel', selectedChannel.id);
      db.updateSetting(guild.id, 'eventLogsEnabled', true);
    }
    if (loggingEnabled !== undefined && loggingEnabled !== null) {
      db.updateSetting(guild.id, 'auditLogChannel', loggingEnabled ? targetChannel?.id || settings.auditLogChannel : null);
      db.updateSetting(guild.id, 'eventLogsEnabled', loggingEnabled);
    } else if (selectedChannel || selectedCategoryChannel
      || Object.entries(updates).some(([category, enabled]) => enabled && (
        channelUpdates[category] || settings.eventLogChannels[category] || settings.auditLogChannel
      ))) {
      db.updateSetting(guild.id, 'eventLogsEnabled', true);
    }
    if (Object.keys(updates).length) {
      db.updateSetting(guild.id, 'eventLogTypes', { ...settings.eventLogTypes, ...updates });
    }
    if (Object.keys(channelUpdates).length) {
      db.updateSetting(guild.id, 'eventLogChannels', { ...settings.eventLogChannels, ...channelUpdates });
    }

    const updated = db.getSettings(guild.id);
    const mainChannel = updated.auditLogChannel ? guild.channels.cache.get(updated.auditLogChannel) : null;
    const lines = Object.entries(LOG_TYPES).map(([key, type]) =>
      `${updated.eventLogsEnabled && updated.eventLogTypes[key] && (updated.eventLogChannels[key] || mainChannel) ? '🟢' : '⚪'} **${type.label}** · ${type.includes} · ${updated.eventLogChannels[key] ? `<#${updated.eventLogChannels[key]}>` : mainChannel || 'No channel'}`
    );
    const hasActiveChannel = Object.keys(LOG_TYPES).some(key =>
      updated.eventLogsEnabled && updated.eventLogTypes[key] && (updated.eventLogChannels[key] || mainChannel)
    );
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const footerText = `Sorgulayan: Lobster | Son güncellenme: ${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} - ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const getStatus = (key) => {
      const enabled = updated.eventLogsEnabled && updated.eventLogTypes[key];
      const hasChan = updated.eventLogChannels[key] || mainChannel;
      return enabled && hasChan ? '🟢' : '⚪';
    };
    const chan = (key) => updated.eventLogChannels[key] ? `<#${updated.eventLogChannels[key]}>` : 'Deaktif';

    const embed = new EmbedBuilder()
      .setColor(hasActiveChannel ? 0x5865f2 : 0x747f8d)
      .setTitle('📜・loglar')
      .setDescription(`📜・loglar\n\n🔮・giriş-çıkış-log ${getStatus('giriş-çıkış-log')} · Üye giriş ve çıkışları · ${chan('giriş-çıkış-log')}\n💬・mesaj-log ${getStatus('mesaj-log')} · Mesaj düzenleme ve silme işlemleri · ${chan('mesaj-log')}\n✨・isim-log ${getStatus('isim-log')} · Üye isim değişiklikleri · ${chan('isim-log')}\n💠・seviye-log ${getStatus('seviye-log')} · Seviye atlamaları · ${chan('seviye-log')}\n⛔・ban-log ${getStatus('ban-log')} · Ban işlemleri · ${chan('ban-log')}\n👢・kick-log ${getStatus('kick-log')} · Kick işlemleri · ${chan('kick-log')}\n🚷・jail-log ${getStatus('jail-log')} · Jail işlemleri · ${chan('jail-log')}\n📞・talep-log ${getStatus('talep-log')} · Talep işlemleri · ${chan('talep-log')}\n🚫・ceza-log ${getStatus('ceza-log')} · Ceza işlemleri · ${chan('ceza-log')}\n🔏・mod-log ${getStatus('mod-log')} · Moderasyon işlemleri · ${chan('mod-log')}\n🛡️・koruma-log ${getStatus('koruma-log')} · Koruma sistem uyarıları · ${chan('koruma-log')}\n🔗・davet-log ${getStatus('davet-log')} · Davet logları · ${chan('davet-log')}\n🔉・ses-log ${getStatus('ses-log')} · Ses kanal hareketleri · ${chan('ses-log')}\n🙂・emoji-log ${getStatus('emoji-log')} · Emoji değişiklikleri · ${chan('emoji-log')}\n\nLobster Logları\n\nModerasyon Logları:\n- ban-log: ${chan('ban-log')}\n- kick-log: ${chan('kick-log')}\n- mute-log: Deaktif\n- jail-log: ${chan('jail-log')}\n- mod-log: ${chan('mod-log')}\n- koruma-log: ${chan('koruma-log')}\n\nGenel Loglar:\n@ • rol-log: Deaktif\n- tepki-log: Deaktif\n- emoji-log: ${chan('emoji-log')}\n- talep-log: ${chan('talep-log')}\n- mesaj-log: ${chan('mesaj-log')}\n- seviye-log: ${chan('seviye-log')}\n- isim-log: ${chan('isim-log')}\n- ses-log: ${chan('ses-log')}\n- kanal-log: Deaktif\n- davet-log: ${chan('davet-log')}\n- giriş-çıkış-log: ${chan('giriş-çıkış-log')}\n- tag-log: Deaktif\n\n${footerText}`)
      .setFooter({ text: 'Lobster Logları' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  },
  LOG_TYPES
};