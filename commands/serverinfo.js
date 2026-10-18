const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

const VERIFICATION_LEVELS = {
  0: 'None',
  1: 'Low · verified email',
  2: 'Medium · 5 minutes in server',
  3: 'High · 10 minutes in server',
  4: 'Very high · verified phone'
};

const BOOST_TIERS = {
  0: 'No level',
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3'
};

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

async function countBots(guild) {
  try {
    if (guild.members.cache.size < guild.memberCount) {
      await Promise.race([
        guild.members.fetch(),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
    }
  } catch {
    // Fall back to whatever is cached if the member list cannot be fetched in time.
  }
  return guild.members.cache.filter(member => member.user.bot).size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show detailed information about this server'),
  category: 'Utility',
  async run({ guild, interaction, message, isSlash }) {
    if (isSlash && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    const channels = guild.channels.cache;
    const countChannels = type => channels.filter(channel => channel.type === type).size;
    const textChannels = countChannels(ChannelType.GuildText) + countChannels(ChannelType.GuildAnnouncement);
    const voiceChannels = countChannels(ChannelType.GuildVoice) + countChannels(ChannelType.GuildStageVoice);
    const categories = countChannels(ChannelType.GuildCategory);

    const total = guild.memberCount;
    const botCount = await countBots(guild);
    const humanCount = Math.max(0, total - botCount);

    const owner = `<@${guild.ownerId}>`;
    const icon = guild.iconURL({ size: 512 });
    const banner = guild.bannerURL({ size: 1024 });
    const features = guild.features
      .map(feature => feature.toLowerCase().replaceAll('_', ' '))
      .slice(0, 8);
    const emojiCount = guild.emojis.cache.size;
    const animatedEmojis = guild.emojis.cache.filter(emoji => emoji.animated).size;

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({
        name: 'Lobster · Server profile',
        ...(icon ? { iconURL: icon } : {})
      })
      .setTitle(`📊 ${guild.name}`)
      .setDescription([
        `👑 **Owner:** ${owner}`,
        `🆔 **Server ID:** \`${guild.id}\``,
        `📅 **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`,
        `🌍 **Language:** ${guild.preferredLocale || 'Not set'}`
      ].join('\n'))
      .addFields(
        {
          name: '👥 Members',
          value: [
            `**${total.toLocaleString()}** total`,
            `👤 Humans: ${humanCount.toLocaleString()} (${percent(humanCount, total)})`,
            `🤖 Bots: ${botCount.toLocaleString()} (${percent(botCount, total)})`
          ].join('\n'),
          inline: true
        },
        {
          name: '📁 Channels',
          value: [
            `**${textChannels + voiceChannels + categories}** total`,
            `💬 Text: ${textChannels}`,
            `🔊 Voice: ${voiceChannels}`,
            `📂 Categories: ${categories}`
          ].join('\n'),
          inline: true
        },
        {
          name: '🚀 Nitro Boost',
          value: [
            `Level: **${BOOST_TIERS[guild.premiumTier] || `Tier ${guild.premiumTier}`}**`,
            `Boosts: **${guild.premiumSubscriptionCount ?? 0}**`,
            `Vanity: ${guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : 'None'}`
          ].join('\n'),
          inline: true
        },
        {
          name: '🛡️ Safety',
          value: `Verification: **${VERIFICATION_LEVELS[guild.verificationLevel] || 'Unknown'}**`,
          inline: true
        },
        {
          name: '🎖️ Roles',
          value: `**${guild.roles.cache.size - 1}**`,
          inline: true
        },
        {
          name: '😀 Emojis',
          value: `**${emojiCount}**${animatedEmojis ? ` · ${animatedEmojis} animated` : ''}`,
          inline: true
        },
        {
          name: '✨ Community features',
          value: features.length ? features.map(feature => `\`${feature}\``).join(' · ') : 'No special features enabled',
          inline: false
        }
      )
      .setFooter({ text: `${LOBSTER_FOOTER} · Server information` })
      .setTimestamp();
    if (icon) embed.setThumbnail(icon);
    if (banner) embed.setImage(banner);

    return isSlash
      ? interaction.editReply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
