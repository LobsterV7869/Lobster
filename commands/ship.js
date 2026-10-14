const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');
const { createShipCard } = require('../utils/ship-card');

function compatibilityLine(score) {
  if (score >= 90) return 'A legendary match made in the stars.';
  if (score >= 75) return 'The stars are definitely onto something.';
  if (score >= 50) return 'There might be a spark here.';
  if (score >= 25) return 'A little chaotic, but that can be fun.';
  return 'Bestie energy is still a great match.';
}

function shipPayload(first, second, score, image, requesterId) {
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setAuthor({ name: 'Lobster · Ship' })
    .setTitle('💞 Compatibility')
    .setDescription(`**${first}**  ×  **${second}**\n${compatibilityLine(score)}\n\n*${score}% compatibility · just for fun*`)
    .setImage('attachment://lobster-ship.png');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ship:again:${requesterId}:${first.id}:${second.id}`)
      .setLabel('Ship again')
      .setEmoji('💞')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ship:delete:${requesterId}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [embed],
    files: [new AttachmentBuilder(image, { name: 'lobster-ship.png' })],
    components: [row],
    allowedMentions: { parse: [] }
  };
}

async function getGuildMember(guild, user) {
  if (!user) return null;
  return guild.members.fetch(user.id).catch(() => null);
}

function getPrefixTargets(message, args, user) {
  const mentions = [...message.mentions.users.values()];
  if (mentions.length === 1) return [user, mentions[0]];
  if (mentions.length >= 2) return mentions.slice(0, 2);
  const ids = args.filter(argument => /^\d{17,20}$/.test(argument));
  if (!ids.length) return [user];
  if (ids.length === 1) return [user, { id: ids[0] }];
  return ids.slice(0, 2).map(id => ({ id }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Make a just-for-fun compatibility card for two server members.')
    .addUserOption(option => option.setName('first').setDescription('First member to ship with').setRequired(false))
    .addUserOption(option => option.setName('second').setDescription('Second member to ship with').setRequired(false)),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, user, guild }) {
    let targets;
    if (isSlash) {
      const first = interaction.options.getUser('first');
      const second = interaction.options.getUser('second');
      targets = first && second ? [first, second] : first ? [user, first] : second ? [user, second] : [user];
    } else {
      targets = getPrefixTargets(message, args, user);
    }

    if (targets.length === 1) {
      const cachedCandidates = guild.members.cache.filter(member =>
        !member.user.bot && member.id !== targets[0].id
      );
      if (cachedCandidates.size) {
        const randomMember = cachedCandidates.random();
        targets = [targets[0], randomMember.user];
      } else {
        const content = 'Mention a member to make a ship card. I could not find another cached member to pick at random.';
        return isSlash
          ? interaction.reply({ content, ephemeral: true })
          : message.reply(content);
      }
    }
    if (targets.length !== 2) {
      const content = 'Usage: `p ship @member` or `p ship @member1 @member2`.';
      return isSlash
        ? interaction.reply({ content, ephemeral: true })
        : message.reply(content);
    }

    if (isSlash) await interaction.deferReply();
    const members = await Promise.all(targets.map(target => getGuildMember(guild, target)));
    if (members.some(member => !member)) {
      const content = 'I could not find one of those members in this server.';
      return isSlash
        ? interaction.editReply({ content })
        : message.reply(content);
    }

    try {
      const score = Math.floor(Math.random() * 101);
      const card = await createShipCard(members[0].user, members[1].user, score);
      const payload = shipPayload(members[0].user, members[1].user, score, card, user.id);
      if (isSlash) return interaction.editReply(payload);
      return message.reply(payload);
    } catch (error) {
      console.error('Ship card generation failed:', error);
      const content = 'I could not generate the ship card right now. Please try again later.';
      if (isSlash) return interaction.editReply({ content });
      return message.reply(content);
    }
  },
  compatibilityLine,
  shipPayload
};
