require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const { TOKEN, CLIENT_ID } = process.env;
if (!TOKEN || !CLIENT_ID) {
  console.error('Set TOKEN and CLIENT_ID in .env before deploying commands.');
  process.exit(1);
}

const commandDirectory = path.join(__dirname, 'commands');
const commands = fs.readdirSync(commandDirectory)
  .filter(file => file.endsWith('.js'))
  .map(file => require(path.join(commandDirectory, file)))
  .filter(command => command.data?.toJSON)
  .map(command => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
  .then(deployed => console.log(`Deployed ${deployed.length} application commands.`))
  .catch(error => {
    console.error('Failed to deploy application commands:', error);
    process.exitCode = 1;
  });
