const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIG_VERSION,
  MAX_IDS,
  cleanId,
  cleanIds,
  defaultConfig,
  normalizeConfig,
  migrateLegacy
} = require('../utils/logging/config');
const { LOG_TYPES } = require('../utils/logging/categories');

const validId = '123456789012345678';
const secondId = '987654321098765432';

test('cleanId accepts only Discord snowflakes', () => {
  assert.equal(cleanId(validId), validId);
  assert.equal(cleanId(` ${validId} `), validId);
  assert.equal(cleanId('123'), null);
  assert.equal(cleanId('not-an-id'), null);
  assert.equal(cleanId(null), null);
});

test('cleanIds removes duplicates, invalid entries, and caps the list', () => {
  assert.deepEqual(cleanIds([validId, secondId, validId, '123', null]), [validId, secondId]);
  assert.deepEqual(cleanIds('nope'), []);
  const many = Array.from({ length: MAX_IDS + 10 }, (_, index) => String(100000000000000000n + BigInt(index)));
  assert.equal(cleanIds(many).length, MAX_IDS);
});

test('defaultConfig enables every type except reactions and ignores bots', () => {
  const config = defaultConfig();
  assert.equal(config.version, CONFIG_VERSION);
  assert.equal(config.enabled, true);
  assert.equal(config.types.reaction.enabled, false);
  for (const type of LOG_TYPES) {
    if (type.key === 'reaction') continue;
    assert.equal(config.types[type.key].enabled, true, `${type.key} should default to enabled`);
    assert.equal(config.types[type.key].ignoreBots, true);
    assert.deepEqual(config.types[type.key].ignoredUsers, []);
  }
});

test('normalizeConfig sanitizes malformed stored values', () => {
  const config = normalizeConfig({
    enabled: 'yes',
    fallbackChannelId: 'invalid',
    categoryId: validId,
    managedChannelIds: [validId, 'bad', validId],
    types: {
      ban: {
        enabled: false,
        channelId: '123',
        ignoredChannels: [validId, 'bad'],
        ignoredRoles: [secondId],
        ignoredUsers: [validId, validId],
        ignoreBots: false,
        lastUpdated: 42,
        lastError: 'x'.repeat(400)
      }
    }
  });

  assert.equal(config.enabled, true);
  assert.equal(config.fallbackChannelId, null);
  assert.equal(config.categoryId, validId);
  assert.deepEqual(config.managedChannelIds, [validId]);
  assert.equal(config.types.ban.enabled, false);
  assert.equal(config.types.ban.channelId, null);
  assert.deepEqual(config.types.ban.ignoredChannels, [validId]);
  assert.deepEqual(config.types.ban.ignoredRoles, [secondId]);
  assert.deepEqual(config.types.ban.ignoredUsers, [validId]);
  assert.equal(config.types.ban.ignoreBots, false);
  assert.equal(config.types.ban.lastUpdated, 42);
  assert.equal(config.types.ban.lastError.length, 300);
});

test('migrateLegacy maps old categories and respects the global switch', () => {
  const migrated = migrateLegacy({
    eventLogsEnabled: false,
    auditLogChannel: validId,
    eventLogTypes: { moderation: false, members: true },
    eventLogChannels: { moderation: secondId, members: 'bad' }
  });

  assert.equal(migrated.enabled, false);
  assert.equal(migrated.fallbackChannelId, validId);
  assert.equal(migrated.types.ban.enabled, false);
  assert.equal(migrated.types.ban.channelId, secondId);
  assert.equal(migrated.types.joinleave.enabled, false);
  assert.equal(migrated.types.joinleave.channelId, null);
  assert.equal(migrated.types.reaction.enabled, false);
  assert.equal(migrated.types.protection.channelId, null);
});

test('migrateLegacy keeps enabled categories when logging is on', () => {
  const migrated = migrateLegacy({
    eventLogsEnabled: true,
    eventLogTypes: { moderation: true, members: true },
    eventLogChannels: { members: secondId }
  });

  assert.equal(migrated.enabled, true);
  assert.equal(migrated.types.kick.enabled, true);
  assert.equal(migrated.types.joinleave.enabled, true);
  assert.equal(migrated.types.joinleave.channelId, secondId);
  assert.equal(migrated.types.reaction.enabled, false);
});
