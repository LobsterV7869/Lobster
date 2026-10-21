const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('speak')
    .setDescription('Send a message with a custom name or another member’s name')
    .addStringOption(option => option.setName('message').setDescription('Message to send').setRequired(true))
    .addStringOption(option => option.setName('name').setDescription('Name to display'))
    .addUserOption(option => option.setName('member').setDescription('Member whose name and avatar to use')),
  category: 'General',
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.SendMessages],
  async run({ interaction, message, isSlash, args, channel, guild, user: author }) {
    let text;
    let displayName;
    let avatarURL;

    if (isSlash) {
      text = interaction.options.getString('message');
      displayName = interaction.options.getString('name');
      const target = interaction.options.getUser('member');
      if (target) {
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        displayName ||= targetMember?.displayName || target.username;
        avatarURL = target.displayAvatarURL({ extension: 'png', size: 256 });
      }
    } else {
      const nameIndex = args.indexOf('--name');
      const memberIndex = args.indexOf('--user');
      const messageStart = Math.max(
        nameIndex === -1 ? 0 : nameIndex + 2,
        memberIndex === -1 ? 0 : memberIndex + 2
      );
      text = args.slice(messageStart).join(' ');
      if (nameIndex !== -1) displayName = args[nameIndex + 1];
      if (memberIndex !== -1) {
        const mention = message.mentions.users.first();
        const targetId = mention?.id || args[memberIndex + 1]?.replace(/[<@!>]/g, '');
        const targetMember = targetId ? await guild.members.fetch(targetId).catch(() => null) : null;
        if (!targetMember) return message.reply('I could not find that server member.');
        displayName ||= targetMember.displayName;
        avatarURL = targetMember.user.displayAvatarURL({ extension: 'png', size: 256 });
      }
    }

    if (!text) {
      const response = 'Usage: l speak <message>';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    if (text.length > 2000) {
      const response = 'The message must be 2000 characters or fewer.';
      return isSlash ? interaction.reply({ content: response, ephemeral: true }) : message.reply(response);
    }
    displayName = displayName?.trim();
    if (!displayName) {
      if (isSlash) await interaction.reply({ content: 'Sent.', ephemeral: true });
      else await message.delete().catch(() => {});
      return channel.send(text);
    }

    const webhookName = displayName.slice(0, 80);
    const webhook = await channel.createWebhook({
      name: webhookName,
      avatar: avatarURL || author.displayAvatarURL({ extension: 'png', size: 256 }),
      reason: `Speak command requested by ${author.tag}`
    });
    try {
      if (isSlash) await interaction.reply({ content: 'Sent.', ephemeral: true });
      else await message.delete().catch(() => {});
      await webhook.send({ content: text });
    } finally {
      await webhook.delete('Temporary webhook created by speak command');
    }
  }
};
