const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Show user banner')
    .addUserOption(opt => opt.setName('target').setDescription('User to see banner of')),
  category: 'Utility',
  async run({ interaction, message, isSlash, args, client }) {
    let user;
    if (isSlash) user = interaction.options.getUser('target') || interaction.user;
    else user = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : message.author);

    if (!user) return isSlash ? interaction.reply('User not found') : message.reply('User not found');

    const fullUser = await client.users.fetch(user.id, { force: true });
    if (!fullUser.banner) {
      return isSlash ? interaction.reply('User has no banner') : message.reply('User has no banner');
    }

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Banner`)
      .setImage(fullUser.bannerURL({ dynamic: true, size: 512 }))
      .setColor('#0099ff');
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
