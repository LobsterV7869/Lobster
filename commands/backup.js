const { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database');
const backups = require('../utils/backups');

const MAX_EXPORT_BYTES = 9_000_000;

function summary(snapshot) {
  return `Backup for **${snapshot.guild.name}** created <t:${Math.floor(Date.parse(snapshot.createdAt) / 1000)}:R>.\n`
    + `${snapshot.roles.length} roles · ${snapshot.channels.length} channels · ${snapshot.messages.length.toLocaleString()} messages.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Opt in to message, role, and channel backups')
    .addSubcommand(option => option.setName('enable').setDescription('Enable three-day backups of server messages, roles, and channels'))
    .addSubcommand(option => option.setName('disable').setDescription('Disable automatic backups'))
    .addSubcommand(option => option.setName('status').setDescription('Show backup status'))
    .addSubcommand(option => option.setName('create').setDescription('Save a server message, role, and channel backup now'))
    .addSubcommand(option => option.setName('export').setDescription('Download the latest backup')),
  category: 'General',
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],
  async run({ interaction, guild }) {
    const action = interaction.options.getSubcommand();
    const settings = db.getSettings(guild.id);
    await interaction.deferReply({ ephemeral: true });

    if (action === 'enable') {
      db.updateSetting(guild.id, 'backupsEnabled', true);
      try {
        const result = await backups.createBackup(guild);
        return interaction.editReply({
          content: `Automatic backups enabled. ${summary(result.snapshot)}\nLobster keeps only the newest successful backup on its host.`,
        });
      } catch (error) {
        return interaction.editReply(`Automatic backups are enabled, but the first backup failed: ${error.message}`);
      }
    }

    if (action === 'disable') {
      db.updateSetting(guild.id, 'backupsEnabled', false);
      return interaction.editReply('Automatic backups disabled. The latest backup is still available to export.');
    }

    if (action === 'status') {
      let snapshot;
      try {
        snapshot = backups.readBackup(guild.id);
      } catch {
        return interaction.editReply(`Automatic backups are ${settings.backupsEnabled ? 'enabled' : 'disabled'}, but the saved backup could not be read. Run \`/backup create\` to replace it.`);
      }
      if (!snapshot) {
        return interaction.editReply(`Automatic backups are ${settings.backupsEnabled ? 'enabled' : 'disabled'}. No backup exists yet.`);
      }
      const nextDue = Date.parse(snapshot.createdAt) + backups.BACKUP_INTERVAL_MS;
      return interaction.editReply(`${summary(snapshot)}\nAutomatic backups are ${settings.backupsEnabled ? 'enabled' : 'disabled'}${settings.backupsEnabled ? ` · next backup <t:${Math.floor(nextDue / 1000)}:R>` : ''}.`);
    }

    if (action === 'create') {
      try {
        const result = await backups.createBackup(guild);
        return interaction.editReply(summary(result.snapshot));
      } catch (error) {
        return interaction.editReply(`Backup failed: ${error.message}`);
      }
    }

    let snapshot;
    let backupPath;
    try {
      snapshot = backups.readBackup(guild.id);
      backupPath = backups.getBackupPath(guild.id);
    } catch {
      return interaction.editReply('The saved backup could not be read. Run `/backup create` to replace it.');
    }
    if (!snapshot) {
      return interaction.editReply('No backup exists yet. Run `/backup create` first.');
    }
    const attachment = new AttachmentBuilder(backupPath, {
      name: `lobster-backup-${guild.id}-${snapshot.createdAt.slice(0, 10)}.json.gz`
    });
    const fileSize = require('node:fs').statSync(backupPath).size;
    if (fileSize > MAX_EXPORT_BYTES) {
      return interaction.editReply(`This backup is ${Math.ceil(fileSize / 1_000_000)} MB, too large to export as one Discord attachment. It remains saved on the bot host.`);
    }
    return interaction.editReply({ content: summary(snapshot), files: [attachment] });
  }
};
