const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const INTERACTIONS = {
  kiss: { verb: 'kisses', self: 'kisses themselves', emoji: '💋', description: 'Blow a kiss at a member', color: 0xff6b9d },
  hug: { verb: 'hugs', self: 'hugs themselves', emoji: '🤗', description: 'Give a member a warm hug', color: 0xff8fab },
  cuddle: { verb: 'cuddles', self: 'cuddles themselves', emoji: '🫂', description: 'Cuddle up with a member', color: 0xff8fab },
  slap: { verb: 'slaps', self: 'slaps themselves', emoji: '👋', description: 'Slap a member with an anime GIF', color: 0xffa94d },
  pat: { verb: 'pats', self: 'pats themselves', emoji: '🫳', description: 'Give a member a gentle pat', color: 0xffd43b },
  poke: { verb: 'pokes', self: 'pokes themselves', emoji: '👉', description: 'Poke a member', color: 0xffd43b },
  bite: { verb: 'bites', self: 'bites themselves', emoji: '😬', description: 'Playfully bite a member', color: 0xff8787 },
  lick: { verb: 'licks', self: 'licks themselves', emoji: '👅', description: 'Lick a member', color: 0xff8fab },
  highfive: { verb: 'high-fives', self: 'high-fives themselves', emoji: '🙌', description: 'High-five a member', color: 0x57f287 },
  kick: { verb: 'kicks', self: 'kicks themselves', emoji: '🦵', description: 'Kick a member with an anime GIF', color: 0xffa94d },
  punch: { verb: 'punches', self: 'punches themselves', emoji: '👊', description: 'Punch a member with an anime GIF', color: 0xffa94d },
  bonk: { verb: 'bonks', self: 'bonks themselves', emoji: '🔨', description: 'Bonk a member with an anime GIF', color: 0xffa94d },
  yeet: { verb: 'yeets', self: 'yeets themselves', emoji: '🚀', description: 'Yeet a member into orbit', color: 0x5865f2 },
  shoot: { verb: 'shoots', self: 'shoots themselves', emoji: '🔫', description: 'Shoot a member with an anime GIF', color: 0xff4d4d },
  kill: { verb: 'kills', self: 'kills themselves', emoji: '🔪', description: 'Eliminate a member with an anime GIF', color: 0xff4d4d }
};

const PROVIDERS = [
  {
    name: 'nekos.best',
    url: action => `https://nekos.best/api/v2/${action}`,
    pick: data => data?.results?.[0]?.url
  },
  {
    name: 'purrbot',
    url: action => `https://purrbot.site/api/img/sfw/${action}/gif`,
    pick: data => data?.link
  },
  {
    name: 'otakugifs',
    url: action => `https://api.otakugifs.xyz/gif?reaction=${action}`,
    pick: data => data?.url
  }
];

const ACTION_ALIASES = {
  kill: ['kill', 'shoot']
};

function validGif(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value);
}

async function tryProvider(provider, action) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(provider.url(action), {
      signal: controller.signal,
      headers: { 'User-Agent': 'LobsterBot (https://github.com/LobsterV7869/Lobster)' }
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const value = provider.pick(data);
    return validGif(value) ? value : null;
  } catch {
    return null;
  }
}

async function fetchGif(action) {
  const names = ACTION_ALIASES[action] || [action];
  for (const name of names) {
    for (const provider of PROVIDERS) {
      const gif = await tryProvider(provider, name);
      if (gif) return gif;
    }
  }
  return null;
}

function buildInteractionEmbed(action, author, target, gif) {
  const meta = INTERACTIONS[action];
  const isSelf = author.id === target.id;
  const description = isSelf
    ? `**${author.username}** ${meta.self} ${meta.emoji}`
    : `**${author.username}** ${meta.verb} **${target.username}** ${meta.emoji}`;
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setAuthor({
      name: `${meta.emoji} ${action.charAt(0).toUpperCase()}${action.slice(1)}`,
      iconURL: author.displayAvatarURL({ size: 128 })
    })
    .setDescription(description)
    .setFooter({ text: '🦞 Lobster' })
    .setTimestamp();
  if (gif) embed.setImage(gif);
  return embed;
}

function createInteractionCommand(action) {
  const meta = INTERACTIONS[action];
  return {
    data: new SlashCommandBuilder()
      .setName(action)
      .setDescription(meta.description)
      .addUserOption(option => option
        .setName('user')
        .setDescription('The member to target')
        .setRequired(true)),
    category: 'Fun',
    async run({ interaction, message, isSlash, args, guild }) {
      let target;
      if (isSlash) {
        target = interaction.options.getUser('user');
      } else {
        target = message.mentions.users.first()
          || (args[0] ? await guild.client.users.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
      }
      if (!target) {
        const warning = `Mention a member to use this command, for example \`/${action} user:@someone\`.`;
        return isSlash ? interaction.reply({ content: warning, ephemeral: true }) : message.reply(warning);
      }
      const author = isSlash ? interaction.user : message.author;
      const gif = await fetchGif(action);
      const embed = buildInteractionEmbed(action, author, target, gif);
      const payload = { embeds: [embed], allowedMentions: { parse: [] } };
      return isSlash ? interaction.reply(payload) : message.reply(payload);
    }
  };
}

module.exports = { INTERACTIONS, createInteractionCommand, buildInteractionEmbed, fetchGif };
