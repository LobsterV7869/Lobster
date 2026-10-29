const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('booster')
    .setDescription('Configure boost notifications')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel for boost notifications')
      .addChannelTypes(ChannelType.GuildText))
    .addStringOption(option => option.setName('message').setDescription('Boost message; supports {user}, {server}, {boost_count}, {boost_level}').setMaxLength(4000))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable boost notifications')),
  category: 'Configuration',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, guild, isSlash }) {
    if (!isSlash) return interaction.reply({ content: 'This command can only be used via slash commands.', ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const enabled = interaction.options.getBoolean('enabled');

    const settings = db.getSettings(guild.id);
    const updates = {};

    if (channel) updates.boosterChannel = channel.id;
    if (message) updates.boosterMessage = message;
    if (enabled !== null) updates.boosterEnabled = enabled ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      return interaction.reply({
        content: `Current boost settings:\n- Enabled: ${settings.boosterEnabled ? 'Yes' : 'No'}\n- Channel: ${settings.boosterChannel ? `<#${settings.boosterChannel}>` : 'None'}\n- Message: ${settings.boosterMessage}`,
        ephemeral: true
      });
    }

    for (const [key, value] of Object.entries(updates)) {
      db.updateSetting(guild.id, key, value);
    }

    interaction.reply({ content: 'Booster settings updated!', ephemeral: true });
  }
};
