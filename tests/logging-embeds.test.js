const test = require('node:test');
const assert = require('node:assert/strict');
const {
  truncate,
  formatIds,
  formatChannel,
  buildEventEmbed,
  buildPanelEmbed,
  buildTypeDetailEmbed,
  buildSetupEmbed,
  buildRemoveConfirmEmbed,
  buildRemoveChannelsEmbed
} = require('../utils/logging/embeds');
const { defaultConfig } = require('../utils/logging/config');
const { TYPE_MAP } = require('../utils/logging/categories');

const validId = '123456789012345678';
const missingId = '987654321098765432';
const guild = { channels: { cache: new Map([[validId, { id: validId }]]) } };

function embedTotal(data) {
  return (data.title?.length || 0)
    + (data.description?.length || 0)
    + (data.footer?.text.length || 0)
    + (data.author?.name.length || 0)
    + (data.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

test('truncate keeps short strings and adds an ellipsis to long ones', () => {
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate(null, 4), '');
  assert.equal(truncate('abc', 0), '');
});

test('formatIds and formatChannel handle mentions and missing channels', () => {
  assert.match(formatIds([validId, missingId], 'user'), /<@123456789012345678>/);
  assert.match(formatIds([validId], 'role'), /<@&123456789012345678>/);
  assert.equal(formatIds([], 'channel'), 'None');
  assert.equal(formatChannel(guild, validId), `<#${validId}>`);
  assert.match(formatChannel(guild, missingId), /missing/);
  assert.equal(formatChannel(guild, null), 'Not set');
});

test('buildEventEmbed stays within Discord limits and rejects unsafe URLs', () => {
  const payload = {
    title: 'T'.repeat(300),
    footer: 'F'.repeat(2100),
    description: 'D'.repeat(5000),
    thumbnail: 'javascript:alert(1)',
    image: 'not a url',
    url: 'javascript:alert(1)',
    author: { name: 'A'.repeat(300), iconURL: 'javascript:alert(1)', url: 'javascript:alert(1)' },
    fields: Array.from({ length: 40 }, (_, index) => ({
      name: `Field ${index} ${'N'.repeat(300)}`,
      value: 'V'.repeat(1100),
      inline: index % 2 === 0
    }))
  };
  const data = buildEventEmbed(TYPE_MAP.ban, payload).data;
  assert.ok(data.title.length <= 256);
  assert.ok(data.description.length <= 4096);
  assert.ok(data.footer.text.length <= 2048);
  assert.ok((data.fields || []).length <= 25);
  assert.ok(embedTotal(data) <= 6000);
  assert.equal(data.thumbnail, undefined);
  assert.equal(data.image, undefined);
  assert.equal(data.url, undefined);
  assert.equal(data.author.iconURL, undefined);
  assert.equal(data.author.url, undefined);
});

test('buildEventEmbed includes target, executor, and reason fields', () => {
  const data = buildEventEmbed(TYPE_MAP.ban, {
    target: '<@123456789012345678>',
    executorId: missingId,
    executorTag: 'Moderator#0001',
    reason: 'Repeated spam',
    timestamp: 'not a date'
  }).data;
  const values = Object.fromEntries(data.fields.map(field => [field.name, field.value]));
  assert.match(values.Target, /123456789012345678/);
  assert.match(values.Executor, /Moderator#0001/);
  assert.equal(values.Reason, 'Repeated spam');
  assert.ok(data.timestamp);
});

test('panel embed shows attention warnings for enabled types without channels', () => {
  const config = defaultConfig();
  const data = buildPanelEmbed(guild, config, { tag: 'Tester#0001' }).data;
  assert.equal(data.title, 'Lobster Logs');
  assert.match(data.description, /Your server\. Your rules\./);
  const attention = data.fields.find(field => field.name === 'Needs Attention');
  assert.ok(attention);
  assert.match(attention.value, /Bans/);
  assert.match(attention.value, /no channel/);
  assert.match(data.footer.text, /Tester#0001/);
});

test('panel embed surfaces auto-disabled log errors', () => {
  const config = defaultConfig();
  config.types.channel.lastError = 'The configured channel was deleted.';
  const data = buildPanelEmbed(guild, config, { username: 'Tester' }).data;
  const attention = data.fields.find(field => field.name === 'Needs Attention');
  assert.ok(attention);
  assert.match(attention.value, /configured channel was deleted/);
});

test('type detail explains message content intent and ignored entries', () => {
  const config = defaultConfig();
  config.types.message.ignoredUsers = [validId];
  config.types.message.ignoredRoles = [missingId];
  const data = buildTypeDetailEmbed(guild, config, TYPE_MAP.message).data;
  const fields = Object.fromEntries(data.fields.map(field => [field.name, field.value]));
  assert.match(fields['Message content'], /Message Content intent/);
  assert.match(fields['Ignored users'], new RegExp(validId));
  assert.match(fields['Ignored roles'], new RegExp(missingId));
  assert.equal(data.title, '💬 Messages');
});

test('setup and removal embeds describe their effects', () => {
  const setup = buildSetupEmbed({
    created: [{ id: validId }],
    reused: [{ id: missingId }],
    skipped: ['reaction'],
    category: { id: validId }
  }).data;
  assert.match(setup.description, new RegExp(validId));
  assert.match(setup.description, new RegExp(missingId));
  assert.match(setup.description, /reaction/);

  assert.match(buildRemoveConfirmEmbed().data.description, /disables every log type/i);
  assert.match(buildRemoveChannelsEmbed().data.description, /never deleted/i);
});
