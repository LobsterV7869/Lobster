const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Enable or disable the register system')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable registration')),
  category: 'Community',
  permissions: [PermissionFlagsBits.ManageGuild],
  async run({ interaction, message, isSlash, args, guild }) {
    const settings = db.getSettings(guild.id);
    const stateArg = args[0]?.toLowerCase();
    const requestedState = isSlash
      ? interaction.options.getBoolean('enabled')
      : ['on', 'enable', 'enabled'].includes(stateArg) ? true
        : ['off', 'disable', 'disabled'].includes(stateArg) ? false : null;
    const newState = requestedState === null ? (settings.register ? 0 : 1) : Number(requestedState);
    db.updateSetting(guild.id, 'register', newState);

    const embed = new EmbedBuilder()
      .setColor(newState ? '#00ff00' : '#ff0000')
      .setDescription(`✅ Register system is now **${newState ? 'Enabled' : 'Disabled'}**`);
    
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await message.reply({ embeds: [embed] });
  }
};
