const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Make the bot join your voice channel'),
  category: 'General',
  botPermissions: [PermissionFlagsBits.Connect],
  async run({ interaction, message, isSlash, member, guild }) {
    const vc = member.voice.channel;
    if (!vc) return isSlash ? interaction.reply('You need to be in a voice channel!') : message.reply('You need to be in a voice channel!');

    joinVoiceChannel({
      channelId: vc.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    if (isSlash) await interaction.reply(`✅ Joined **${vc.name}**`);
    else await message.reply(`✅ Joined **${vc.name}**`);
  }
};
