const { PermissionFlagsBits } = require('discord.js');
const { styledContext } = require('./command-style');
const { installAutoConvert } = require('../canvas/autoConvert');

function permissionNames(permissions) {
  return permissions.map(permission =>
    Object.entries(PermissionFlagsBits).find(([, value]) => value === permission)?.[0] || String(permission)
  );
}

async function reply(context, content, ephemeral = false) {
  const { interaction, message, isSlash } = context;
  if (isSlash && interaction) {
    const payload = { content, ephemeral };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload);
    }
    return interaction.reply(payload);
  }
  if (message) return message.reply(content);
  return null;
}

async function executeCommand(command, context) {
  context = styledContext(command, context);
  const { guild, member, user, isSlash } = context;
  const restoreAuto = installAutoConvert(context, command);

  try {
    if (command.guildOnly && !guild) {
      return await reply(context, 'This command can only be used in a server.', true);
    }

    if (command.ownerOnly && (!process.env.OWNER_ID || user.id !== process.env.OWNER_ID)) {
      return await reply(context, 'This command is restricted to the bot owner.', true);
    }

    if (command.permissions?.length && !member?.permissions?.has(command.permissions)) {
      const required = permissionNames(command.permissions).join(', ');
      return await reply(context, `You need the ${required} permission${command.permissions.length > 1 ? 's' : ''} to use this command.`, true);
    }

    if (command.botPermissions?.length) {
      const botMember = guild?.members.me;
      if (!botMember?.permissions.has(command.botPermissions)) {
        const required = permissionNames(command.botPermissions).join(', ');
        return await reply(context, `I need the ${required} permission${command.botPermissions.length > 1 ? 's' : ''} to run this command.`, true);
      }
    }

    return await command.run(context);
  } catch (error) {
    console.error(`Command "${command.data?.name || 'unknown'}" failed:`, error?.message);
    console.error(error?.stack);
    const content = 'I could not run that command. Please check my permissions and try again.';
    if (isSlash && context.interaction) {
      if (context.interaction.deferred || context.interaction.replied) {
        try { return await context.interaction.followUp({ content, ephemeral: true }); } catch (e) { console.error(e); }
      }
      try { return await context.interaction.reply({ content, ephemeral: true }); } catch (e) { console.error(e); }
      return;
    }
    if (context.message) {
      try { return await context.message.reply(content); } catch (e) { console.error(e); }
      return;
    }
    return;
  } finally {
    try { restoreAuto(); } catch (e) {}
  }
}

module.exports = { executeCommand };
