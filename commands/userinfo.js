const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

const MAX_ROLES = 24;

function formatDate(timestamp) {
  return `<t:${Math.floor(timestamp / 1000)}:D> (<t:${Math.floor(timestamp / 1000)}:R>)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show detailed information about a server member')
    .addUserOption(option => option.setName('target').setDescription('Member to look up')),
  category: 'Utility',
  async run({ guild, interaction, message, isSlash, args, client }) {
    let user;
    if (isSlash) {
      user = interaction.options.getUser('target') || interaction.user;
    } else {
      user = message.mentions.users.first()
        || (args[0] ? await client.users.fetch(args[0]).catch(error => {
          if (error.code === 10013) return null;
          throw error;
        }) : message.author);
    }

    if (!user) {
      const response = 'I could not find that Discord user.';
      return isSlash
        ? interaction.reply({ content: response, ephemeral: true })
        : message.reply(response);
    }

    let member = guild.members.cache.get(user.id);
    if (!member) {
      try {
        member = await guild.members.fetch(user.id);
      } catch (error) {
        if (error.code !== 10007) throw error;
      }
    }

    const roles = member
      ? member.roles.cache.filter(role => role.id !== guild.id).sort((first, second) => second.position - first.position)
      : [];
    const roleList = [...roles.values()].slice(0, MAX_ROLES).map(role => `<@&${role.id}>`);
    const roleCount = roles.size || 0;
    const highestRole = member?.roles.highest;
    const name = member?.displayName || user.globalName || user.username;

    const description = [
      `**${name}**`,
      member?.nickname ? `AKA ${member.nickname}` : null,
      `[${user.tag}](${user.displayAvatarURL()}) · ${user.bot ? '🤖 Bot' : '👤 User'}${member?.premiumSince ? ' · ⭐ Booster' : ''}`
    ].filter(Boolean).join('\n');

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Member profile', iconURL: user.displayAvatarURL() })
      .setTitle(`👤 ${name}`)
      .setDescription(description)
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: '🆔 Account ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Bot account', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: '👑 Primary role', value: highestRole && highestRole.id !== guild.id ? `<@&${highestRole.id}>` : 'No roles', inline: true },
        { name: '📅 Registered', value: formatDate(user.createdTimestamp), inline: true },
        {
          name: '🚪 Joined server',
          value: member?.joinedTimestamp ? formatDate(member.joinedTimestamp) : 'Not a member of this server',
          inline: true
        },
        {
          name: '⭐ Boosting since',
          value: member?.premiumSinceTimestamp ? formatDate(member.premiumSinceTimestamp) : 'Not boosting',
          inline: true
        }
      )
      .setFooter({ text: `${LOBSTER_FOOTER} · ${guild.name}` })
      .setTimestamp();

    embed.addFields({
      name: `🎖️ Roles · ${roleCount}`,
      value: roleList.length
        ? `${roleList.join(' ')}${roleCount > MAX_ROLES ? ` **+${roleCount - MAX_ROLES} more**` : ''}`
        : 'No roles',
      inline: false
    });

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
