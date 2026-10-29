const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  ROOT_CATEGORY_NAME,
  TYPE_MAP,
  channelName
} = require('./categories');
const {
  getLogConfig,
  saveLogConfig,
  setCategory,
  clearManagedChannels,
  disableAll
} = require('./config');

function logPermissions(guild) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];
}

async function ensureCategory(guild, config) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Lobster needs the Manage Channels permission to create log channels.');
  }
  let category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
  if (category && category.type !== ChannelType.GuildCategory) category = null;
  if (!category) {
    category = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory && channel.name === ROOT_CATEGORY_NAME
    ) || null;
  }

  let createdByBot = Boolean(category && config.categoryId === category.id && config.categoryCreatedByBot);
  if (!category) {
    category = await guild.channels.create({
      name: ROOT_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: logPermissions(guild),
      reason: 'Lobster log category'
    });
    createdByBot = true;
  } else {
    await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason: 'Lobster log privacy' });
    await category.permissionOverwrites.edit(guild.members.me, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true
    }, { reason: 'Lobster log access' });
  }

  if (config.categoryId !== category.id || config.categoryCreatedByBot !== createdByBot) {
    setCategory(guild.id, category.id, createdByBot);
    config.categoryId = category.id;
    config.categoryCreatedByBot = createdByBot;
  }
  return category;
}

async function setupLogChannels(guild) {
  const config = getLogConfig(guild.id);
  const category = await ensureCategory(guild, config);
  const created = [];
  const reused = [];
  const skipped = [];
  const managed = [];

  for (const type of Object.values(TYPE_MAP)) {
    const typeConfig = config.types[type.key];
    if (!typeConfig?.enabled) {
      skipped.push(type.key);
      continue;
    }
    let channel = typeConfig.channelId ? guild.channels.cache.get(typeConfig.channelId) : null;
    if (channel && !channel.isTextBased()) channel = null;
    if (!channel) {
      channel = guild.channels.cache.find(candidate =>
        candidate.parentId === category.id &&
        candidate.name === channelName(type.key) &&
        candidate.isTextBased()
      ) || null;
      if (channel) reused.push(channel);
    } else {
      reused.push(channel);
    }

    if (!channel) {
      channel = await guild.channels.create({
        name: channelName(type.key),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: logPermissions(guild),
        reason: `Lobster log channel for ${type.label}`
      });
      created.push(channel);
      managed.push(channel.id);
    }

    if (typeConfig.channelId !== channel.id || typeConfig.lastError) {
      typeConfig.channelId = channel.id;
      typeConfig.lastError = null;
      typeConfig.lastUpdated = Date.now();
    }
  }

  if (managed.length) {
    config.managedChannelIds = [...new Set([...config.managedChannelIds, ...managed])];
  }
  saveLogConfig(guild.id, config);
  return { category, created, reused, skipped };
}

async function deleteManagedChannels(guild) {
  const config = getLogConfig(guild.id);
  const deleted = [];
  const failed = [];
  const managed = new Set(config.managedChannelIds);
  for (const channelId of managed) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    try {
      await channel.delete('Lobster logs removed by an administrator');
      deleted.push(channelId);
    } catch (error) {
      failed.push({ channelId, message: error.message });
    }
  }

  const category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
  if (category && config.categoryCreatedByBot && category.children.cache.size === 0) {
    try {
      await category.delete('Lobster logs removed by an administrator');
      deleted.push(category.id);
    } catch (error) {
      failed.push({ channelId: category.id, message: error.message });
    }
  }

  clearManagedChannels(guild.id);
  return { deleted, failed };
}

async function removeLogs(guild, { deleteChannels = false } = {}) {
  let result = { deleted: [], failed: [] };
  if (deleteChannels) {
    result = await deleteManagedChannels(guild);
  }
  disableAll(guild.id, {
    clearChannels: true,
    clearCategory: deleteChannels
  });
  return result;
}

module.exports = {
  ensureCategory,
  setupLogChannels,
  deleteManagedChannels,
  removeLogs
};
