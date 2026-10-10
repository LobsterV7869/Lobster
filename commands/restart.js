const { SlashCommandBuilder } = require('discord.js');
const { spawn } = require('node:child_process');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot (Bot Owner Only)'),
  category: 'General',
  ownerOnly: true,
  async run({ interaction, message, isSlash, client }) {
    if (isSlash) await interaction.deferReply({ ephemeral: true });
    const child = spawn(process.execPath, process.argv.slice(1), {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    try {
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } catch (error) {
      console.error('Could not restart Lobster:', error);
      const response = 'I could not start the replacement process, so the current bot is still running.';
      if (isSlash) return interaction.editReply(response);
      return message.reply(response);
    }

    if (isSlash) await interaction.editReply('Restarting Lobster...');
    else await message.reply('Restarting Lobster...');
    child.unref();
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 500);
  }
};
