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
      .setTitle('📜 Lobster Rules')
      .setDescription(
        '**1. Be respectful.**\nNo insults, harassment, hate speech or discrimination. Disagree politely.\n\n'
        + '**2. No spam.**\nDon’t flood chat, repeat messages, or overuse caps, emojis or mentions.\n\n'
        + '**3. No advertising.**\nDon’t post invites, server promos or self-promotion without staff approval.\n\n'
        + '**4. Keep it safe.**\nNo NSFW, gore, or illegal content. No sharing personal information, yours or anyone else’s.\n\n'
        + '**5. No scams or malicious links.**\nPhishing, fake giveaways and suspicious files lead to an instant ban.\n\n'
        + '**6. Use the right channels.**\nAsk for help in support, post suggestions in suggestions, and keep bug reports in the bug channel.\n\n'
        + '**7. Don’t beg or ping staff.**\nOpen a ticket if you need help, and be patient.\n\n'
        + '**8. Follow staff decisions.**\nIf you disagree with a moderation action, open a ticket. Don’t argue in public.\n\n'
        + '**9. Follow Discord’s rules.**\nYou must follow the Discord Terms of Service and Community Guidelines.\n\n'
        + 'Breaking the rules may lead to a warning, mute, kick or ban, depending on how serious it is.'
      )
      .setColor(0x5BA6FB)
      .setAuthor({ name: 'Lobster · Server guide' })
      .setFooter({ text: 'Please follow these rules to keep the community welcoming.' });
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await channel.send({ embeds: [embed] });
  }
};
