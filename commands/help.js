const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../utils/database');
const { LOBSTER_BLUE } = require('../utils/command-style');

const SUPPORT_URL = 'https://discord.gg/lobster';
const INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1557475110741344308&scope=bot%20applications.commands&permissions=0';

const CATEGORIES = {
  General: '🛠️',
  Moderation: '🛡️',
  Utility: '🔎',
  Music: '🎵',
  Fun: '🎮'
};

function commandCategory(command) {
  if (command.category === 'Moderation') return 'Moderation';
  if (command.category === 'Utility') return 'Utility';
  if (command.category === 'Music') return 'Music';
  if (command.category === 'Fun') return 'Fun';
  return 'General';
}

// Uses the server's own custom emoji when one with the matching name exists,
// otherwise falls back to a plain Unicode glyph so the menu never looks broken.
function resolveEmoji(guild, names, fallback) {
  try {
    const cache = guild && guild.emojis && guild.emojis.cache;
    if (cache && typeof cache.find === 'function') {
      for (const name of names) {
        const found = cache.find(e => e && e.name && e.name.toLowerCase() === name.toLowerCase());
        if (found) return `<:${found.name}:${found.id}>`;
      }
    }
  } catch (error) {
    // emoji lookup must never break /help
  }
  return fallback;
}

const listEmoji = guild => resolveEmoji(guild, ['help', 'menu', 'list', 'listdetails', 'category', 'catecory'], '📋');
const dotEmoji = guild => resolveEmoji(guild, ['dot', 'dots', 'dotsvertical', 'bullet', 'point'], '•');
const arrowEmoji = guild => resolveEmoji(guild, ['arrow', 'arrowright', 'arrow_right', 'right', 'chevron'], '→');

// Commands may arrive as a Collection (from client.commands.filter) or an Array.
function toArray(commands) {
  if (Array.isArray(commands)) return commands;
  if (commands && typeof commands.values === 'function') return [...commands.values()];
  return [];
}

function commandLines(commands, dot) {
  const list = toArray(commands);
  if (!list.length) return 'No commands in this category yet.';
  return list
    .map(command => `${dot} \`/${command.data.name}\` - ${command.data.description}`)
    .join('\n')
    .slice(0, 3900);
}

function overviewEmbed(client, prefix, guild) {
  const list = listEmoji(guild);
  const dot = dotEmoji(guild);
  const arrow = arrowEmoji(guild);
  const avatar = client.user.displayAvatarURL({ size: 256 });

  const lines = Object.keys(CATEGORIES).map(category => {
    const count = client.commands.filter(command => commandCategory(command) === category).size;
    return `${dot} **${category}** ${arrow} ${count} command${count === 1 ? '' : 's'}`;
  });

  return new EmbedBuilder()
    .setColor(LOBSTER_BLUE)
    .setAuthor({ name: 'Lobster · Help System', iconURL: avatar })
    .setTitle(`${list} Help Menu`)
    .setDescription([
      'Select a category below to view its commands.',
      `You can use my commands with \`${prefix}\` or \`/\`. My prefix commands are the same as the slash commands.`,
      '',
      lines.join('\n')
    ].join('\n'))
    .setThumbnail(avatar)
    .setFooter({ text: 'Lobster Help System' });
}

function categoryEmbed(category, commands, prefix, guild, client) {
  const list = listEmoji(guild);
  const dot = dotEmoji(guild);
  const avatar = client && client.user ? client.user.displayAvatarURL({ size: 256 }) : null;
  const count = toArray(commands).length;

  const embed = new EmbedBuilder()
    .setColor(LOBSTER_BLUE)
    .setTitle(`${list} ${category} Commands`)
    .setDescription([
      `**${count} command${count === 1 ? '' : 's'}** · use them as \`/command\` or \`${prefix} command\``,
      '',
      commandLines(commands, dot)
    ].join('\n'))
    .setFooter({ text: 'Lobster Help System' });

  if (avatar) {
    embed.setAuthor({ name: 'Lobster · Help System', iconURL: avatar });
    embed.setThumbnail(avatar);
  }

  return embed;
}

function categoryMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lobster_help_category')
      .setPlaceholder('Home Menu')
      .addOptions([
        { label: 'Help home', value: 'Home', description: 'Back to the help menu', emoji: '🏠' },
        ...Object.keys(CATEGORIES).map(category => ({
          label: category,
          value: category,
          description: `View ${category.toLowerCase()} commands`,
          emoji: CATEGORIES[category]
        }))
      ])
  );
}

function helpButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Support Server')
      .setURL(SUPPORT_URL)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🎧'),
    new ButtonBuilder()
      .setLabel('Add Me')
      .setURL(INVITE_URL)
      .setStyle(ButtonStyle.Link)
      .setEmoji('➕')
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse Lobster commands and setup guides'),
  category: 'Utility',
  async run({ client, interaction, message, isSlash, guild }) {
    const prefix = db.getSettings(guild.id).prefix || 'l';
    const response = {
      embeds: [overviewEmbed(client, prefix, guild)],
      components: [categoryMenu(), helpButtons()]
    };
    return isSlash
      ? interaction.reply(response)
      : message.reply(response);
  },
  CATEGORIES,
  commandCategory,
  overviewEmbed,
  categoryEmbed,
  categoryMenu,
  helpButtons
};
