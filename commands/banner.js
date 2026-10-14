const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LOBSTER_ORANGE, LOBSTER_FOOTER } = require('../utils/command-style');

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

    if (!user) return isSlash ? interaction.reply('❌ I could not find that user.') : message.reply('❌ I could not find that user.');

    const fullUser = await client.users.fetch(user.id, { force: true });
    if (!fullUser.banner) {
      return isSlash ? interaction.reply('🎏 That user has no banner set.') : message.reply('🎏 That user has no banner set.');
    }

    const embed = new EmbedBuilder()
      .setColor(LOBSTER_ORANGE)
      .setAuthor({ name: 'Lobster · Banner', iconURL: user.displayAvatarURL() })
      .setTitle(`🎏 ${user.username}`)
      .setImage(fullUser.bannerURL({ dynamic: true, size: 512 }))
      .setFooter({ text: LOBSTER_FOOTER })
      .setTimestamp();

    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
