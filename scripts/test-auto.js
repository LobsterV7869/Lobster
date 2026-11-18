const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const { convertPayload } = require('../canvas/autoConvert');

async function saveConverted(name, payload, context = {}) {
  const out = await convertPayload(payload, context);
  if (!out) {
    console.log(`SKIP ${name}: not converted`);
    return null;
  }
  const file = Array.isArray(out.files) ? out.files[0] : null;
  const buf = file?.attachment || file;
  if (!Buffer.isBuffer(buf)) {
    console.log(`SKIP ${name}: no buffer`);
    return null;
  }
  const fp = path.join(__dirname, '..', 'out', `auto-${name}.png`);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, buf);
  console.log(`OK ${name}: ${buf.length} bytes, content=${JSON.stringify(out.content)}, embeds=${(out.embeds||[]).length}, components preserved=${!!out.components}`);
  return fp;
}

async function main() {
  // text only -> result info
  await saveConverted('text-info', { content: 'Pong! Latency is 42ms.' });

  // error text
  await saveConverted('text-error', { content: 'Error: I could not find that user.' });

  // warning text
  await saveConverted('text-warning', { content: 'Warning: You are missing permissions.' });

  // embed with fields (1-8) -> info card
  const infoEmbed = new EmbedBuilder()
    .setTitle('User Info')
    .setDescription('Some description here')
    .addFields(
      { name: 'Username', value: 'Omar', inline: true },
      { name: 'ID', value: '123456789', inline: true },
      { name: 'Joined', value: '07 Nov 2026', inline: true },
      { name: 'Roles', value: '5', inline: true },
    )
    .setFooter({ text: 'Requested by test' })
    .setColor(0x5865f2);
  await saveConverted('embed-fields', { embeds: [infoEmbed] });

  // embed description only, green -> result success
  const successEmbed = new EmbedBuilder()
    .setTitle('Ban Successful')
    .setDescription('**BadUser#1234** has been banned.\nReason: spam')
    .setColor(0x57f287);
  await saveConverted('embed-success', { embeds: [successEmbed] });

  // long help embed -> list card
  const helpEmbed = new EmbedBuilder()
    .setTitle('Help Menu')
    .setDescription('Utility\n- `l ping` - latency\n- `l help` - this menu\n- `l userinfo` - user info\nModeration\n- `l ban` - ban\n- `l kick` - kick\n- `l mute` - mute\nFun\n- `l rank` - rank\n- `l leaderboard` - top users')
    .setColor(0x5865f2);
  await saveConverted('embed-help', { embeds: [helpEmbed] });

  // >8 fields -> list card
  const manyFields = new EmbedBuilder().setTitle('Many Fields').setColor(0x5865f2);
  for (let i = 1; i <= 10; i++) manyFields.addFields({ name: `Field ${i}`, value: `Value ${i}` });
  await saveConverted('embed-many-fields', { embeds: [manyFields] });

  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
