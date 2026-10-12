const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const db = require('../utils/database');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

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
  },
  Fun: {
    description: 'Anime interaction commands like kiss, hug, slap, and kill.',
    emoji: '🎮'
  }
};

function commandCategory(command) {
  if (command.category === 'Moderation') return 'Moderation';
  if (command.category === 'Utility') return 'Utility';
  if (command.category === 'Fun') return 'Fun';
  return 'General';
}

function commandLines(commands, prefix) {
  return commands
    .map(command => `**\`/${command.data.name}\`** · \`${prefix} ${command.data.name}\`\n> ${command.data.description}`)
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
    .setAuthor({ name: 'Lobster · Help centre', iconURL: client.user.displayAvatarURL() })
    .setTitle('🦞 Lobster Commands')
    .setDescription([
      `Everything Lobster can do, grouped by category. Pick one from the menu below.`,
      `**Prefix:** \`${prefix}\` · **Slash:** \`/\``,
      `Every command works both ways — \`${prefix} ping\` is the same as \`/ping\`.`
    ].join('\n'))
    .addFields(
      ...Object.entries(CATEGORIES).map(([category, details]) => ({
        name: `${details.emoji}  ${category} · ${counts[category]} commands`,
        value: details.description,
        inline: false
      })),
      {
        name: '🚀  Popular features',
        value: '`/welcomer` welcome cards · `/ticket-panel` support · `/levels` chat XP · `/automod` filters · `/security` protections · `/log` event logs',
        inline: false
      },
      {
        name: '⚙️  Getting started',
        value: [
          `Server admins: run \`/setup\` for a ready-made role and channel layout.`,
          `Change the prefix with \`/prefix\`.`
        ].join('\n'),
        inline: false
      },
      {
        name: '🔒  Privacy',
        value: 'Message backups are **off by default**. Admins can opt in to `/backup` for a rotating three-day snapshot.',
        inline: false
      }
    )
    .setFooter({ text: `${LOBSTER_FOOTER} · Commands available as /command or prefix command` })
    .setTimestamp();
}

function categoryEmbed(category, commands, prefix) {
  const details = CATEGORIES[category];
  return new EmbedBuilder()
    .setColor(LOBSTER_ORANGE)
    .setAuthor({ name: 'Lobster · Help centre' })
    .setTitle(`${details.emoji}  ${category}`)
    .setDescription([
      `**${commands.length} command${commands.length === 1 ? '' : 's'}** · use them as \`/command\` or \`${prefix} command\`.`,
      '',
      commandLines(commands, prefix)
    ].join('\n'))
    .setFooter({ text: LOBSTER_FOOTER })
    .setTimestamp();
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
