const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { roleHierarchyError } = require('../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleall')
    .setDescription('Give or remove a role for every member in the server')
    .addRoleOption(opt => opt.setName('role').setDescription('The role to apply to everyone').setRequired(true))
    .addStringOption(opt => opt
      .setName('action')
      .setDescription('Add or remove the role (default: add)')
      .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
    .addBooleanOption(opt => opt
      .setName('include_bots')
      .setDescription('Also apply the role to bots (default: no)')),
  category: 'Moderation',
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  async run({ interaction, message, isSlash, args, guild, member: actor }) {
    let role;
    let action = 'add';
    let includeBots = false;

    if (isSlash) {
      role = interaction.options.getRole('role');
      action = interaction.options.getString('action') || 'add';
      includeBots = interaction.options.getBoolean('include_bots') || false;
    } else {
      role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
      const requested = (args[1] || '').toLowerCase();
      if (requested === 'remove' || requested === 'rm' || requested === 'off') action = 'remove';
    }

    if (!role) {
      const text = '🎭 Which role should everyone get?\n`l roleall @role`\n-# Adds it to every member in the server.';
      return isSlash ? interaction.reply({ content: text, ephemeral: true }) : message.reply(text);
    }

    const targetError = roleHierarchyError(actor, role, guild);
    if (targetError) {
      return isSlash ? interaction.reply({ content: `❌ ${targetError}`, ephemeral: true }) : message.reply(`❌ ${targetError}`);
    }

    let progressMessage;
    if (isSlash) await interaction.deferReply();
    else progressMessage = await message.reply('⏳ Applying the role, this can take a moment…');
    const reply = payload => (isSlash ? interaction.editReply(payload) : progressMessage.edit(payload));

    let members;
    try {
      members = await guild.members.fetch();
    } catch (error) {
      console.error('roleall: could not fetch members:', error);
      return reply({ content: '❌ I could not fetch the member list. Make sure I have the **Server Members Intent** enabled.' });
    }

    const targets = [...members.values()].filter(candidate => {
      if (candidate.user.bot && !includeBots) return false;
      const has = candidate.roles.cache.has(role.id);
      return action === 'add' ? !has : has;
    });

    if (targets.length === 0) {
      const verb = action === 'add' ? 'already have' : 'do not have';
      return reply({ content: `✅ Every member ${verb} ${role}. Nothing to do.` });
    }

    const verb = action === 'add' ? 'Adding' : 'Removing';
    let index = 0;
    let changed = 0;
    let failed = 0;

    const worker = async () => {
      while (index < targets.length) {
        const target = targets[index++];
        try {
          if (action === 'add') await target.roles.add(role, 'Lobster roleall');
          else await target.roles.remove(role, 'Lobster roleall');
          changed += 1;
        } catch (error) {
          failed += 1;
        }
        const processed = changed + failed;
        if (processed % 25 === 0) {
          await reply({ content: `⏳ ${verb} ${role}: ${processed}/${targets.length}…` }).catch(() => {});
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(8, targets.length) }, worker));

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `✅ ${action === 'add' ? 'Added' : 'Removed'} ${role} for **${changed}** member${changed === 1 ? '' : 's'}.` +
        (failed ? `\n⚠️ Could not update **${failed}** member${failed === 1 ? '' : 's'} (role too high or missing permissions).` : '')
      );
    return reply({ content: '', embeds: [embed] });
  }
};
