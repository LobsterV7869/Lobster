const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Send the server rules to the channel'),
  category: 'General',
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, channel }) {
    const embed = new EmbedBuilder()
      .setTitle('📜 Server Rules')
      .setDescription('1. Be respectful to others.\n2. No spamming or advertising.\n3. No NSFW content.\n4. Follow Discord ToS.\n5. Have fun!')
      .setColor(0xff6b35)
      .setAuthor({ name: 'Lobster · Server guide' })
      .setFooter({ text: 'Please follow these rules to keep the community welcoming.' });
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await channel.send({ embeds: [embed] });
  }
};
