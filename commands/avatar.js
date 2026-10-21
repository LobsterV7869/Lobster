const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_BLUE, LOBSTER_FOOTER } = require('../utils/command-style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show user avatar')
    .addUserOption(opt => opt.setName('target').setDescription('User to see avatar of')),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, guild }) {
    let user;
    if (isSlash) user = interaction.options.getUser('target') || interaction.user;
    else user = message.mentions.users.first() || (args[0] ? await guild.client.users.fetch(args[0]).catch(() => null) : message.author);

    if (!user) return isSlash ? interaction.reply('Usage: l avatar [@user]') : message.reply('Usage: l avatar [@user]');

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_BLUE)
      .setAuthor({ name: 'Lobster · Avatar', iconURL: user.displayAvatarURL() })
      .setTitle(`🖼️ ${user.username}`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setFooter({ text: LOBSTER_FOOTER })
      .setTimestamp();

    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
