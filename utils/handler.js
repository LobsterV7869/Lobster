const { PermissionFlagsBits } = require('discord.js');
const { styledContext } = require('./command-style');

function permissionNames(permissions) {
  return permissions.map(permission =>
    Object.entries(PermissionFlagsBits).find(([, value]) => value === permission)?.[0] || String(permission)
  );
}

async function reply(context, content, ephemeral = false) {
  const { interaction, message, isSlash } = context;
  if (isSlash) {
    const payload = { content, ephemeral };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload);
    }
    return interaction.reply(payload);
  }
  return message.reply(content);
}

async function executeCommand(command, context) {
  context = styledContext(command, context);
  const { guild, member, user, isSlash } = context;

  if (command.guildOnly && !guild) {
    return reply(context, '🌐 This command can only be used in a server.', true);
  }

  if (command.ownerOnly && (!process.env.OWNER_ID || user.id !== process.env.OWNER_ID)) {
    return reply(context, '🔒 This command is restricted to the bot owner.', true);
  }

  if (command.permissions?.length && !member?.permissions?.has(command.permissions)) {
    const required = permissionNames(command.permissions).join(', ');
    return reply(context, `🚫 You need the **${required}** permission${command.permissions.length > 1 ? 's' : ''} to use this command.`, true);
  }

  if (command.botPermissions?.length) {
    const botMember = guild?.members.me;
    if (!botMember?.permissions.has(command.botPermissions)) {
      const required = permissionNames(command.botPermissions).join(', ');
      return reply(context, `⚠️ I need the **${required}** permission${command.botPermissions.length > 1 ? 's' : ''} to run this command.`, true);
    }
  }

  try {
    return await command.run(context);
  } catch (error) {
    console.error(`Command "${command.data.name}" failed:`, error);
    const content = '⚠️ I could not run that command. Please check my permissions and try again.';
    if (isSlash) {
      if (context.interaction.deferred || context.interaction.replied) {
        return context.interaction.followUp({ content, ephemeral: true });
      }
      return context.interaction.reply({ content, ephemeral: true });
    }
    return context.message.reply(content);
  }
}

module.exports = { executeCommand };
