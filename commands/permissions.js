const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Show user permissions')
    .addUserOption(opt => opt.setName('target').setDescription('User to see permissions of')),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, guild }) {
    let user;
    if (isSlash) user = interaction.options.getUser('target') || interaction.user;
    else user = message.mentions.users.first() || (args[0] ? await guild.client.users.fetch(args[0]).catch(() => null) : message.author);

    if (!user) return isSlash ? interaction.reply('❌ I could not find that user.') : message.reply('❌ I could not find that user.');
    const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      const response = 'That user is not a member of this server.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }

    const perms = member.permissions.toArray().map(p => `\`${p}\``).join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Lobster · Permissions' })
      .setTitle(`🔎 ${user.username}'s permissions`)
      .setDescription(perms)
      .setColor(0x5BA6FB);
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
