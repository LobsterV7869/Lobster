const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

const FILTERS = [
  ['links', 'Block links'],
  ['invites', 'Block Discord invites'],
  ['advertisements', 'Block common ad phrases'],
  ['spam', 'Block message floods'],
  ['duplicate', 'Block repeated messages'],
  ['caps', 'Block excessive capitals'],
  ['emoji', 'Block excessive emoji'],
  ['mentions', 'Block excessive mentions'],
  ['longMessages', 'Block long messages'],
  ['longLines', 'Block long messages with many lines'],
  ['imageSpam', 'Block image spam']
];

function stateFromString(value) {
  if (['on', 'enable', 'enabled', 'true'].includes(value?.toLowerCase())) return true;
  if (['off', 'disable', 'disabled', 'false'].includes(value?.toLowerCase())) return false;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure the server’s automatic message filters')
    .addBooleanOption(option => option.setName('enabled').setDescription('Turn all automod filters on or off'))
    .addBooleanOption(option => option.setName('links').setDescription('Block links'))
    .addBooleanOption(option => option.setName('invites').setDescription('Block Discord invites'))
    .addBooleanOption(option => option.setName('advertisements').setDescription('Block common ad phrases'))
    .addBooleanOption(option => option.setName('spam').setDescription('Block message floods'))
    .addBooleanOption(option => option.setName('duplicate').setDescription('Block repeated messages'))
    .addBooleanOption(option => option.setName('caps').setDescription('Block excessive capitals'))
    .addBooleanOption(option => option.setName('emoji').setDescription('Block excessive emoji'))
    .addBooleanOption(option => option.setName('mentions').setDescription('Block excessive mentions'))
    .addBooleanOption(option => option.setName('long_messages').setDescription('Block messages over the configured character limit'))
    .addBooleanOption(option => option.setName('long_lines').setDescription('Block messages over the configured line limit'))
    .addBooleanOption(option => option.setName('image_spam').setDescription('Block repeated image uploads'))
    .addIntegerOption(option => option.setName('spam_limit').setDescription('Messages allowed per flood window (3-20)').setMinValue(3).setMaxValue(20))
    .addIntegerOption(option => option.setName('spam_window_seconds').setDescription('Flood window in seconds (2-60)').setMinValue(2).setMaxValue(60))
    .addIntegerOption(option => option.setName('duplicate_limit').setDescription('Repeated copies allowed per minute (2-5)').setMinValue(2).setMaxValue(5))
    .addIntegerOption(option => option.setName('caps_percentage').setDescription('Uppercase percentage limit (50-100)').setMinValue(50).setMaxValue(100))
    .addIntegerOption(option => option.setName('emoji_limit').setDescription('Emoji allowed per message (3-30)').setMinValue(3).setMaxValue(30))
    .addIntegerOption(option => option.setName('mentions_limit').setDescription('Mentions allowed per message (2-10)').setMinValue(2).setMaxValue(10))
    .addIntegerOption(option => option.setName('long_message_limit').setDescription('Character limit (100-4000)').setMinValue(100).setMaxValue(4000))
    .addIntegerOption(option => option.setName('long_lines_limit').setDescription('Line limit (2-20)').setMinValue(2).setMaxValue(20))
    .addIntegerOption(option => option.setName('image_spam_limit').setDescription('Images allowed per minute (2-20)').setMinValue(2).setMaxValue(20))
    .addStringOption(option => option.setName('blocked_words').setDescription('Comma-separated words to block; replaces the current list').setMaxLength(1000))
    .addStringOption(option => option.setName('remove_word').setDescription('Remove a word from the blocked-word list').setMaxLength(100)),
  category: 'Security',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, guild, user }) {
    const settings = db.getSettings(guild.id);
    const rules = { ...settings.automodRules };
    let enabled;
    let updated = false;

    if (isSlash) {
      enabled = interaction.options.getBoolean('enabled');
      for (const [key, optionName] of [
        ['links', 'links'],
        ['invites', 'invites'],
        ['advertisements', 'advertisements'],
        ['spam', 'spam'],
        ['duplicate', 'duplicate'],
        ['caps', 'caps'],
        ['emoji', 'emoji'],
        ['mentions', 'mentions'],
        ['longMessages', 'long_messages'],
        ['longLines', 'long_lines'],
        ['imageSpam', 'image_spam']
      ]) {
        const value = interaction.options.getBoolean(optionName);
        if (value !== null) {
          rules[key] = value;
          updated = true;
        }
      }
      for (const [key, optionName] of [
        ['spamLimit', 'spam_limit'],
        ['spamWindowSeconds', 'spam_window_seconds'],
        ['duplicateLimit', 'duplicate_limit'],
        ['capsPercentage', 'caps_percentage'],
        ['emojiLimit', 'emoji_limit'],
        ['mentionsLimit', 'mentions_limit'],
        ['longMessagesLimit', 'long_message_limit'],
        ['longLinesLimit', 'long_lines_limit'],
        ['imageSpamLimit', 'image_spam_limit']
      ]) {
        const value = interaction.options.getInteger(optionName);
        if (value !== null) {
          rules[key] = value;
          updated = true;
        }
      }
      const wordList = interaction.options.getString('blocked_words');
      const removeWord = interaction.options.getString('remove_word');
      if (wordList !== null) {
        rules.blockedWords = [...new Set(wordList.split(',').map(word => word.trim()).filter(Boolean))].slice(0, 50);
        updated = true;
      }
      if (removeWord) {
        rules.blockedWords = rules.blockedWords.filter(word => word.toLowerCase() !== removeWord.toLowerCase());
        updated = true;
      }
    } else {
      enabled = stateFromString(args[0]);
      if (enabled === null && !args.some(arg => arg.startsWith('--'))) {
        enabled = !settings.automod;
      }
      const flags = {
        links: 'links',
        invites: 'invites',
        advertisements: 'advertisements',
        spam: 'spam',
        duplicate: 'duplicate',
        caps: 'caps',
        emoji: 'emoji',
        mentions: 'mentions',
        'long-messages': 'longMessages',
        'long-lines': 'longLines',
        'image-spam': 'imageSpam'
      };
      for (const [flag, key] of Object.entries(flags)) {
        const index = args.indexOf(`--${flag}`);
        if (index !== -1) {
          const value = stateFromString(args[index + 1]);
          if (value !== null) {
            rules[key] = value;
            updated = true;
          }
        }
      }
      const numericFlags = {
        'spam-limit': ['spamLimit', 3, 20],
        'spam-window': ['spamWindowSeconds', 2, 60],
        'duplicate-limit': ['duplicateLimit', 2, 5],
        'caps-percentage': ['capsPercentage', 50, 100],
        'emoji-limit': ['emojiLimit', 3, 30],
        'mentions-limit': ['mentionsLimit', 2, 10],
        'max-chars': ['longMessagesLimit', 100, 4000],
        'max-lines': ['longLinesLimit', 2, 20],
        'image-limit': ['imageSpamLimit', 2, 20]
      };
      for (const [flag, [key, minimum, maximum]] of Object.entries(numericFlags)) {
        const index = args.indexOf(`--${flag}`);
        if (index === -1) continue;
        const value = Number(args[index + 1]);
        if (!Number.isInteger(value) || value < minimum || value > maximum) {
          return message.reply(`⚙️ ${flag} must be between ${minimum} and ${maximum}.`);
        }
        rules[key] = value;
        updated = true;
      }
      const wordsIndex = args.indexOf('--words');
      if (wordsIndex !== -1) {
        const nextFlag = args.findIndex((arg, index) => index > wordsIndex && arg.startsWith('--'));
        const rawWords = args.slice(wordsIndex + 1, nextFlag === -1 ? args.length : nextFlag).join(' ');
        rules.blockedWords = [...new Set(rawWords.split(',').map(word => word.trim()).filter(Boolean))].slice(0, 50);
        updated = true;
      }
      const removeIndex = args.indexOf('--remove-word');
      if (removeIndex !== -1 && args[removeIndex + 1]) {
        const word = args[removeIndex + 1].toLowerCase();
        rules.blockedWords = rules.blockedWords.filter(value => value.toLowerCase() !== word);
        updated = true;
      }
    }

    if (enabled !== null && enabled !== undefined) {
      db.updateSetting(guild.id, 'automod', Number(enabled));
    }
    if (updated) db.updateSetting(guild.id, 'automodRules', rules);

    const current = db.getSettings(guild.id);
    const filterSummary = FILTERS.map(([key, label]) =>
      `${current.automodRules[key] ? '✅' : '▫️'} ${label}`
    );
    filterSummary.push(
      `${current.automodRules.blockedWords.length ? '✅' : '▫️'} Blocked words (${current.automodRules.blockedWords.length})`
    );
    const embed = new EmbedBuilder()
      .setColor(current.automod ? 0x5BA6FB : 0x747f8d)
      .setAuthor({ name: 'Lobster · AutoMod action' })
      .setTitle('🤖 AutoMod')
      .setDescription(
        `The automatic moderation filter is **${current.automod ? 'enabled' : 'disabled'}**.\n\n` +
        `**Rule name:** Lobster AutoMod\n**Moderator:** ${user}\n\n${filterSummary.join('\n')}`
      )
      .setFooter({ text: 'Staff with Manage Messages are exempt. Configure filters with /automod.' });
    return isSlash
      ? interaction.reply({ embeds: [embed], ephemeral: true })
      : message.reply({ embeds: [embed] });
  }
};
