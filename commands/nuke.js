const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { logModeration } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Recreate this channel, instantly clearing its message history'),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async run({ interaction, message, isSlash, channel, guild, user: moderator }) {
    if (isSlash) await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const position = channel.position;
    const reason = `Nuke by ${moderator.tag}`;
    const clone = await channel.clone({ reason });
    await channel.delete(reason);
    await clone.setPosition(position).catch(() => {});
    if (clone.type === ChannelType.GuildText) {
      await clone.send(`💥 Channel rebuilt by ${moderator}.`).catch(() => {});
    }

    logModeration(guild, 'Channel nuked', `${moderator} rebuilt ${clone}.`);
    if (isSlash) await interaction.editReply({ content: `Channel rebuilt as ${clone}.` }).catch(() => {});
  }
};
