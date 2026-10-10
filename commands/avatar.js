const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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

    if (!user) return isSlash ? interaction.reply('User not found') : message.reply('User not found');

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor('#0099ff');
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
