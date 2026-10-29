const db = require('../database');
const { LOG_TYPES, TYPE_MAP } = require('./categories');

const CONFIG_VERSION = 2;
const cache = new Map();
const MAX_IDS = 100;
const ID_PATTERN = /^\d{17,20}$/;

const LEGACY_SOURCES = {
  ban: ['moderation'],
  kick: ['moderation'],
  timeout: ['moderation'],
  mod: ['moderation'],
  protection: ['security'],
  role: ['roles'],
  reaction: [],
  emoji: ['emojis', 'stickers'],
  ticket: ['tickets'],
  message: ['messages'],
  level: ['levels'],
  name: ['tags', 'members'],
  voice: ['voice'],
  channel: ['channels', 'threads'],
  invite: ['invites'],
  joinleave: ['members', 'bots']
};

function cleanIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map(value => String(value).trim())
    .filter(value => ID_PATTERN.test(value)))].slice(0, MAX_IDS);
}

function cleanId(value) {
  if (value === null || value === undefined || value === '') return null;
  const string = String(value).trim();
  return ID_PATTERN.test(string) ? string : null;
}

function emptyType(type) {
  return {
    enabled: type.defaultEnabled !== false,
    channelId: null,
    ignoredChannels: [],
    ignoredRoles: [],
    ignoredUsers: [],
    ignoreBots: true,
    lastUpdated: null,
    lastError: null
  };
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    fallbackChannelId: null,
    categoryId: null,
    categoryCreatedByBot: false,
    managedChannelIds: [],
    types: Object.fromEntries(LOG_TYPES.map(type => [type.key, emptyType(type)]))
  };
}

function normalizeType(raw, type) {
  const base = emptyType(type);
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    channelId: cleanId(raw.channelId),
    ignoredChannels: cleanIds(raw.ignoredChannels),
    ignoredRoles: cleanIds(raw.ignoredRoles),
    ignoredUsers: cleanIds(raw.ignoredUsers),
    ignoreBots: typeof raw.ignoreBots === 'boolean' ? raw.ignoreBots : true,
    lastUpdated: Number.isFinite(raw.lastUpdated) ? raw.lastUpdated : null,
    lastError: typeof raw.lastError === 'string' ? raw.lastError.slice(0, 300) : null
  };
}

function normalizeConfig(raw) {
  const config = defaultConfig();
  if (!raw || typeof raw !== 'object') return config;
  config.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
  config.fallbackChannelId = cleanId(raw.fallbackChannelId);
  config.categoryId = cleanId(raw.categoryId);
  config.categoryCreatedByBot = Boolean(raw.categoryCreatedByBot);
  config.managedChannelIds = cleanIds(raw.managedChannelIds);
  for (const type of LOG_TYPES) {
    config.types[type.key] = normalizeType(raw.types?.[type.key], type);
  }
  return config;
}

function migrateLegacy(settings) {
  const config = defaultConfig();
  const enabledGlobally = settings.eventLogsEnabled !== false;
  config.enabled = enabledGlobally;
  config.fallbackChannelId = cleanId(settings.auditLogChannel);
  for (const type of LOG_TYPES) {
    const sources = LEGACY_SOURCES[type.key] || [];
    if (!sources.length) {
      config.types[type.key].enabled = false;
      continue;
    }
    const enabled = sources.some(source => settings.eventLogTypes?.[source] !== false);
    const channelId = sources
      .map(source => cleanId(settings.eventLogChannels?.[source]))
      .find(Boolean) || null;
    config.types[type.key] = {
      ...emptyType(type),
      enabled: enabledGlobally && enabled,
      channelId
    };
  }
  config.types.reaction.enabled = false;
  return config;
}

function readConfig(guildId) {
  const settings = db.getSettings(guildId);
  if (settings.logs) {
    const normalized = normalizeConfig(settings.logs);
    if (settings.logs.version !== CONFIG_VERSION) {
      db.updateSetting(guildId, 'logs', normalized);
    }
    return normalized;
  }
  const migrated = migrateLegacy(settings);
  db.updateSetting(guildId, 'logs', migrated);
  return migrated;
}

function getLogConfig(guildId) {
  if (!guildId) throw new Error('A guild ID is required to read logging settings.');
  if (cache.has(guildId)) return cache.get(guildId);
  const config = readConfig(guildId);
  cache.set(guildId, config);
  return config;
}

function invalidate(guildId) {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}

function saveLogConfig(guildId, config) {
  const normalized = normalizeConfig(config);
  db.updateSetting(guildId, 'logs', normalized);
  cache.set(guildId, normalized);
  return normalized;
}

function updateType(guildId, typeKey, patch = {}) {
  if (!TYPE_MAP[typeKey]) throw new Error('Unknown log type.');
  const config = getLogConfig(guildId);
  const current = config.types[typeKey];
  const next = normalizeType({ ...current, ...patch, lastUpdated: Date.now(), lastError: null }, TYPE_MAP[typeKey]);
  config.types[typeKey] = next;
  return saveLogConfig(guildId, config);
}

function resetType(guildId, typeKey) {
  if (!TYPE_MAP[typeKey]) throw new Error('Unknown log type.');
  const config = getLogConfig(guildId);
  config.types[typeKey] = { ...emptyType(TYPE_MAP[typeKey]), lastUpdated: Date.now() };
  return saveLogConfig(guildId, config);
}

function setTypeError(guildId, typeKey, message) {
  const config = getLogConfig(guildId);
  if (!config.types[typeKey]) return config;
  config.types[typeKey].lastError = String(message || 'Unknown error').slice(0, 300);
  return saveLogConfig(guildId, config);
}

function disableType(guildId, typeKey, reason) {
  const config = getLogConfig(guildId);
  if (!config.types[typeKey]) return config;
  config.types[typeKey].enabled = false;
  config.types[typeKey].lastError = String(reason || 'Logging was disabled automatically.').slice(0, 300);
  config.types[typeKey].lastUpdated = Date.now();
  return saveLogConfig(guildId, config);
}

function setGlobalEnabled(guildId, enabled) {
  const config = getLogConfig(guildId);
  config.enabled = Boolean(enabled);
  return saveLogConfig(guildId, config);
}

function setFallbackChannel(guildId, channelId) {
  const config = getLogConfig(guildId);
  config.fallbackChannelId = cleanId(channelId);
  return saveLogConfig(guildId, config);
}

function setCategory(guildId, categoryId, createdByBot = false) {
  const config = getLogConfig(guildId);
  config.categoryId = cleanId(categoryId);
  config.categoryCreatedByBot = Boolean(createdByBot);
  return saveLogConfig(guildId, config);
}

function addManagedChannels(guildId, channelIds) {
  const config = getLogConfig(guildId);
  config.managedChannelIds = cleanIds([...config.managedChannelIds, ...channelIds]);
  return saveLogConfig(guildId, config);
}

function clearManagedChannels(guildId, channelIds = null) {
  const config = getLogConfig(guildId);
  if (!channelIds) {
    config.managedChannelIds = [];
  } else {
    const remove = new Set(cleanIds(channelIds));
    config.managedChannelIds = config.managedChannelIds.filter(id => !remove.has(id));
  }
  return saveLogConfig(guildId, config);
}

function disableAll(guildId, { clearChannels = false, clearCategory = false } = {}) {
  const config = getLogConfig(guildId);
  for (const type of LOG_TYPES) {
    const current = config.types[type.key];
    config.types[type.key] = {
      ...current,
      enabled: false,
      ...(clearChannels ? { channelId: null } : {}),
      lastUpdated: Date.now()
    };
  }
  if (clearChannels) config.managedChannelIds = [];
  if (clearCategory) {
    config.categoryId = null;
    config.categoryCreatedByBot = false;
  }
  return saveLogConfig(guildId, config);
}

function enabledTypes(config) {
  return LOG_TYPES.filter(type => config.types[type.key]?.enabled);
}

module.exports = {
  CONFIG_VERSION,
  ID_PATTERN,
  MAX_IDS,
  cleanId,
  cleanIds,
  defaultConfig,
  normalizeConfig,
  migrateLegacy,
  getLogConfig,
  invalidate,
  saveLogConfig,
  updateType,
  resetType,
  setTypeError,
  disableType,
  setGlobalEnabled,
  setFallbackChannel,
  setCategory,
  addManagedChannels,
  clearManagedChannels,
  disableAll,
  enabledTypes
};
