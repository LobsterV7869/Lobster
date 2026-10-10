const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { LOBSTER_ORANGE } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show detailed information about this server'),
  category: 'Utility',
  async run({ guild, interaction, message }) {
    const channels = guild.channels.cache;
    const countChannels = type => channels.filter(channel => channel.type === type).size;
    const owner = `<@${guild.ownerId}>`;
    const icon = guild.iconURL({ size: 512 });
    const banner = guild.bannerURL({ size: 1024 });
    const features = guild.features
      .map(feature => feature.toLowerCase().replaceAll('_', ' '))
      .slice(0, 8);
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({
        name: 'Lobster · Server profile',
        ...(icon ? { iconURL: icon } : {})
      })
      .setTitle(guild.name)
      .setDescription([
        `**Owner:** ${owner}`,
        `**Server ID:** \`${guild.id}\``,
        `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F> · <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`
      ].join('\n'))
      .addFields(
        { name: 'Members', value: `${guild.memberCount.toLocaleString()}`, inline: true },
        { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} · Level ${guild.premiumTier}`, inline: true },
        { name: 'Verification', value: `${guild.verificationLevel}`, inline: true },
        { name: 'Text channels', value: `${countChannels(ChannelType.GuildText) + countChannels(ChannelType.GuildAnnouncement)}`, inline: true },
        { name: 'Voice channels', value: `${countChannels(ChannelType.GuildVoice) + countChannels(ChannelType.GuildStageVoice)}`, inline: true },
        { name: 'Roles · Emojis', value: `${guild.roles.cache.size - 1} · ${guild.emojis.cache.size}`, inline: true },
        { name: 'Language', value: guild.preferredLocale || 'Not set', inline: true },
        { name: 'Vanity invite', value: guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : 'Not set', inline: true },
        {
          name: 'Community features',
          value: features.length ? features.map(feature => `\`${feature}\``).join(' · ') : 'No special features enabled',
          inline: false
        }
      )
      .setFooter({ text: `${guild.name} · Server information` })
      .setTimestamp();
    if (icon) embed.setThumbnail(icon);
    if (banner) embed.setImage(banner);

    return interaction
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
