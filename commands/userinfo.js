const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE } = require('../utils/command-style');

function formatDate(timestamp) {
  return `<t:${Math.floor(timestamp / 1000)}:F>\n<t:${Math.floor(timestamp / 1000)}:R>`;
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
    const roleList = [...roles.values()].slice(0, 12).map(role => `<@&${role.id}>`);
    const roleCount = roles.size || 0;
    const highestRole = member?.roles.highest;
    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Member profile', iconURL: user.displayAvatarURL() })
      .setTitle(member?.displayName || user.globalName || user.username)
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .setDescription([
        `**Account:** ${user.bot ? 'Bot' : 'User'}${member?.premiumSince ? ' · Server booster' : ''}`,
        `**User:** ${user}`,
        `**Highest role:** ${highestRole && highestRole.id !== guild.id ? `<@&${highestRole.id}>` : 'No roles'}`
      ].join('\n'))
      .addFields(
        { name: 'User ID', value: `\`${user.id}\``, inline: true },
        { name: 'Account created', value: formatDate(user.createdTimestamp), inline: true },
        {
          name: 'Joined this server',
          value: member?.joinedTimestamp ? formatDate(member.joinedTimestamp) : 'Not a member of this server',
          inline: true
        },
        {
          name: `Roles${roleCount > 12 ? ` · ${roleCount} total` : ''}`,
          value: roleList.length ? `${roleList.join(', ')}${roleCount > 12 ? `, and ${roleCount - 12} more` : ''}` : 'No roles',
          inline: false
        }
      )
      .setFooter({ text: `Lobster · User information · ${guild.name}` })
      .setTimestamp();

    return isSlash
      ? interaction.reply({ embeds: [embed] })
      : message.reply({ embeds: [embed] });
  }
};
