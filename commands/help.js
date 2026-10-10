const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const db = require('../utils/database');
const { LOBSTER_ORANGE } = require('../utils/command-style');

const CATEGORIES = {
  General: {
    description: 'Setup, community systems, and server configuration.',
    emoji: '🛠️'
  },
  Moderation: {
    description: 'Member and channel moderation tools.',
    emoji: '🛡️'
  },
  Utility: {
    description: 'Server details, member info, and everyday tools.',
    emoji: '🔎'
  }
};

function commandCategory(command) {
  if (command.category === 'Moderation') return 'Moderation';
  if (command.category === 'Utility') return 'Utility';
  return 'General';
}

function commandLines(commands, prefix) {
  return commands
    .map(command => `• \`/${command.data.name}\` · \`${prefix} ${command.data.name}\` — ${command.data.description}`)
    .join('\n')
    .slice(0, 3800);
}

function overviewEmbed(client, prefix) {
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map(category => [
    category,
    client.commands.filter(command => commandCategory(command) === category).size
  ]));
  return new EmbedBuilder()
    .setColor(LOBSTER_ORANGE)
    .setDescription(
      `Select a category below to view its commands. You can use my commands with \`${prefix}\` or /. Prefix commands work the same as slash commands.`
    )
    .addFields(
      ...Object.entries(CATEGORIES).map(([category, details]) => ({
        name: `${details.emoji}  ${category} · ${counts[category]} commands`,
        value: details.description,
        inline: true
      })),
      {
        name: 'Getting started',
        value: `Server admins: run \`/setup\` for a starter layout.\nThis server’s prefix is \`${prefix}\`; change it with \`/prefix\`.`,
        inline: false
      },
      {
        name: 'Popular features',
        value: '`/welcomer` welcome/farewell · `/ticket-panel` support · `/levels` chat XP · `/automod` filters · `/security` protections · `/log` event logs',
        inline: false
      },
      {
        name: 'Privacy',
        value: 'Message backups are off by default. Server admins can opt in to `/backup` for a rotating three-day snapshot.',
        inline: false
      }
    )
    .setFooter({ text: 'Lobster · Commands are available as /command or prefix command' });
}

function categoryEmbed(category, commands, prefix) {
  const details = CATEGORIES[category];
  return new EmbedBuilder()
    .setColor(LOBSTER_ORANGE)
    .setTitle(`🦞 ${details.emoji} ${category}`)
    .setDescription(
      `Commands work with slash or \`${prefix} command\`.\n${commandLines(commands, prefix)}`
    )
    .setFooter({ text: '🦞 Lobster' });
}

function categoryMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lobster_help_category')
      .setPlaceholder('🦞 Choose a command category')
      .addOptions([
        ...Object.entries(CATEGORIES).map(([value, details]) => ({
          label: value,
          value,
          description: details.description,
          emoji: details.emoji
        })),
        { label: 'Help home', value: 'Home', description: 'Setup tips, privacy, and popular commands', emoji: '🏠' }
      ])
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse Lobster commands and setup guides'),
  category: 'Utility',
  async run({ client, interaction, message, isSlash, guild }) {
    const prefix = db.getSettings(guild.id).prefix || 'p';
    const response = {
      embeds: [overviewEmbed(client, prefix)],
      components: [categoryMenu()]
    };
    return isSlash
      ? interaction.reply(response)
      : message.reply(response);
  },
  CATEGORIES,
  commandCategory,
  overviewEmbed,
  categoryEmbed,
  categoryMenu
};
