require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  ActivityType,
  ActionRowBuilder,
  AuditLogEvent,
  AutoModerationActionType,
  AutoModerationRuleTriggerType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Collection,
  EmbedBuilder,
  GatewayIntentBits,
  GuildMember,
  PermissionFlagsBits,
  Partials,
  UserSelectMenuBuilder
} = require('discord.js');
const db = require('./utils/database');
const DiscordTranscripts = require('discord-html-transcripts');
const { createDashboardServer } = require('./dashboard/server');
const voiceManager = require('./dashboard/voice-manager');
const { executeCommand } = require('./utils/handler');
const { stylePayload, styledContext } = require('./utils/command-style');
const { logEvent, handleChannelRemoval } = require('./utils/logging/logger');
const { getLogConfig } = require('./utils/logging/config');
const { handleLogInteraction } = require('./utils/logging/interactions');
const backups = require('./utils/backups');
const { welcomeEmbed } = require('./utils/welcome');
const { farewellEmbed } = require('./utils/farewell');
const { CATEGORIES, commandCategory, overviewEmbed, categoryEmbed, categoryMenu, helpButtons } = require('./commands/help');

if (!process.env.TOKEN) {
  console.error('Set TOKEN in .env before starting Lobster.');
  process.exit(1);
}

async function handleReactionRole(reaction, user, addRole) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const guild = reaction.message.guild;
    if (!guild) return;
    const emojiKey = reaction.emoji.id || reaction.emoji.name;
    const mapping = db.getReactionRole(guild.id, reaction.message.id, emojiKey);
    if (!mapping) return;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(mapping.roleId);
    if (!role?.editable || role.managed) return;
    if (addRole) await member.roles.add(role, 'Lobster reaction role');
    else await member.roles.remove(role, 'Lobster reaction role');
  } catch (error) {
    console.error('Reaction role update failed:', error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});
const dashboardServer = createDashboardServer(client);

client.commands = new Collection();
client.aliases = new Collection();
const commandDirectory = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandDirectory).filter(name => name.endsWith('.js'))) {
  const command = require(path.join(commandDirectory, file));
  if (!command.data?.name || typeof command.run !== 'function') {
    throw new Error(`Invalid command module: ${file}`);
  }
  if (client.commands.has(command.data.name)) {
    throw new Error(`Duplicate command name: ${command.data.name}`);
  }
  client.commands.set(command.data.name, command);
  for (const alias of command.aliases || []) {
    client.aliases.set(alias.toLowerCase(), command.data.name);
  }
}

function styleCommandPayload(commandName, guild, payload) {
  return stylePayload(client.commands.get(commandName), payload, { client, guild, isSlash: false });
}

function parseArguments(input) {
  return input.match(/"([^"]*)"|'([^']*)'|(\S+)/g)?.map(value =>
    value.replace(/^["']|["']$/g, '')
  ) || [];
}

function temporaryReply(promise, milliseconds = 5000) {
  promise.then(reply => setTimeout(() => reply.delete().catch(() => {}), milliseconds))
    .catch(error => console.error('Could not send temporary reply:', error));
}

function ticketOwnerIdFromTopic(topic) {
  if (!topic) return null;
  return topic.match(/^(?:lobster-ticket|ticket-owner):(\d+)$/)?.[1]
    || topic.match(/Ticket sahibi:\s*(\d{17,20})/)?.[1]
    || null;
}

function ticketTopic(ownerId, type = 'Support', priority = 'Normal') {
  return `Ticket sahibi: ${ownerId} | Növ: ${type} | Prioritet: ${priority} | Claim: none`;
}

async function createTicketTranscript(channel) {
  return DiscordTranscripts.createTranscript(channel, {
    limit: -1,
    returnType: 'attachment',
    filename: `${channel.name}-transcript.html`.replace(/[^a-z0-9_.-]/gi, '-'),
    saveImages: false,
    poweredBy: false,
    footerText: 'Exported {number} message{s}.'
  });
}

async function finishGiveaway(giveaway) {
  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel?.isTextBased() || !channel.messages) {
    db.endGiveaway(giveaway.messageId);
    return;
  }

  const message = await channel.messages.fetch(giveaway.messageId);
  const participants = db.getParticipants(giveaway.messageId);
  for (let index = participants.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [participants[index], participants[randomIndex]] = [participants[randomIndex], participants[index]];
  }
  const winners = participants.slice(0, Math.min(giveaway.winners, participants.length));
  const winnerMentions = winners.map(participant => `<@${participant.userId}>`);
  const endedEmbed = new EmbedBuilder()
    .setTitle('🦞 Giveaway ended')
    .setDescription(
      `Prize: **${giveaway.prize}**\nWinners: ${winnerMentions.length ? winnerMentions.join(', ') : 'No winners'}`
    )
    .setColor(0x5BA6FB)
    .setFooter({ text: '🦞 Lobster' });
  await message.edit(styleCommandPayload('giveaway', channel.guild, { embeds: [endedEmbed], components: [] }));
  if (winnerMentions.length) {
    await channel.send(`🦞 Congratulations ${winnerMentions.join(', ')}! You won **${giveaway.prize}**!`);
  } else {
    await channel.send(`🦞 The giveaway for **${giveaway.prize}** ended with no entrants.`);
  }
  db.endGiveaway(giveaway.messageId);
}

let checkingGiveaways = false;
const openingTickets = new Set();
const verifyingMembers = new Set();
const messageWindows = new Map();
const duplicateWindows = new Map();
const joinWindows = new Map();
const joinRaidAlerts = new Map();

function pruneWindowMap(map) {
  if (map.size <= 10000) return;
  for (const oldestKey of map.keys()) {
    map.delete(oldestKey);
    if (map.size <= 9000) break;
  }
}

function recordWindow(map, key, timestamp, duration) {
  const timestamps = (map.get(key) || []).filter(value => timestamp - value < duration);
  timestamps.push(timestamp);
  map.set(key, timestamps);
  pruneWindowMap(map);
  return timestamps.length;
}

async function checkAutomod(message, settings) {
  if (!settings.automod) return false;
  const rules = settings.automodRules;
  const content = message.content;
  if (rules.exemptChannelIds.includes(message.channel.id)
    || rules.exemptRoleIds.some(roleId => message.member.roles.cache.has(roleId))) return false;
  const exemptions = message.member.permissions.has(PermissionFlagsBits.ManageMessages)
    || message.member.permissions.has(PermissionFlagsBits.Administrator);
  if (exemptions) return false;

  const violations = [];
  if (rules.links && /https?:\/\/\S+/i.test(content)) violations.push('links');
  if (rules.invites && /(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)[a-z0-9-]+/i.test(content)) violations.push('invites');
  if (rules.advertisements && /\b(?:join my (?:server|discord)|come join|subscribe|promo(?:tion)? code|free nitro|sunucuma gel|reklam ver)\b/i.test(content)) {
    violations.push('advertisement');
  }
  if (rules.blockedWords.some(word => word && content.toLowerCase().includes(word.toLowerCase()))) violations.push('blocked words');
  if (rules.caps) {
    const letters = content.match(/[a-z]/gi) || [];
    const capitals = content.match(/[A-Z]/g) || [];
    if (letters.length >= 12 && capitals.length / letters.length >= rules.capsPercentage / 100) {
      violations.push('excessive capitals');
    }
  }
  if (rules.emoji && (content.match(/\p{Extended_Pictographic}/gu) || []).length > rules.emojiLimit) {
    violations.push('excessive emoji');
  }
  if (rules.mentions && message.mentions.users.size + message.mentions.roles.size > rules.mentionsLimit) {
    violations.push('excessive mentions');
  }
  if (rules.longMessages && content.length > rules.longMessagesLimit) violations.push('message length');
  if (rules.longLines && content.split(/\r?\n/).length > rules.longLinesLimit) violations.push('message line count');
  if (rules.duplicate && content.trim()) {
    const hash = createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const recent = (duplicateWindows.get(key) || [])
      .filter(entry => now - entry.timestamp < rules.duplicateWindowSeconds * 1000);
    const repeats = recent.filter(entry => entry.hash === hash).length;
    recent.push({ hash, timestamp: now });
    duplicateWindows.set(key, recent.slice(-100));
    pruneWindowMap(duplicateWindows);
    if (repeats >= rules.duplicateLimit - 1) {
      violations.push('repeated messages');
    }
  }
  if (rules.spam && recordWindow(
    messageWindows,
    `${message.guild.id}:${message.author.id}`,
    Date.now(),
    rules.spamWindowSeconds * 1000
  ) > rules.spamLimit) {
    violations.push('message flood');
  }
  if (rules.imageSpam && message.attachments.size) {
    const imageCount = [...message.attachments.values()].filter(attachment =>
      attachment.contentType?.startsWith('image/')
    ).length;
    const imageKey = `${message.guild.id}:${message.author.id}:images`;
    const now = Date.now();
    const recentImages = (messageWindows.get(imageKey) || []).filter(timestamp => now - timestamp < 60000);
    for (let index = 0; index < imageCount; index += 1) recentImages.push(now);
    messageWindows.set(imageKey, recentImages);
    pruneWindowMap(messageWindows);
    if (recentImages.length > rules.imageSpamLimit) {
      violations.push('image spam');
    }
  }
  if (!violations.length) return false;

  await message.delete();
  const notice = await message.channel.send(styleCommandPayload('automod', message.guild, {
    content: `${message.author}, your message was removed by automatic moderation (${violations[0]}).`,
    allowedMentions: { users: [message.author.id] }
  }));
  setTimeout(() => notice.delete().catch(error => {
    if (error.code !== 10008) console.error('Could not remove automod notice:', error);
  }), 5000);
  await logEvent(message.guild, 'protection', {
    title: '🤖 AutoMod action',
    target: `${message.author} (\`${message.author.username}\`)`,
    description: `**Channel:** <#${message.channel.id}>\n**Rule:** ${violations.join(', ')}\n**Content:**\n${quoteContent(message.content, 500)}`,
    fields: [{ name: 'Message ID', value: `\`${message.id}\``, inline: true }],
    thumbnail: message.author.displayAvatarURL(),
    userId: message.author.id,
    bot: message.author.bot,
    channelId: message.channel.id,
    audit: false
  });
  return true;
}
async function endDueGiveaways() {
  if (checkingGiveaways) return;
  checkingGiveaways = true;
  try {
    for (const giveaway of db.getActiveGiveaways()) {
      if (giveaway.endTime > Date.now()) continue;
      try {
        await finishGiveaway(giveaway);
      } catch (error) {
        console.error(`Could not finish giveaway ${giveaway.messageId}:`, error);
        if (error.code === 10003 || error.code === 10008) db.endGiveaway(giveaway.messageId);
      }
    }
  } finally {
    checkingGiveaways = false;
  }
}

async function processDueTempBans() {
  const due = db.getTempBans().filter(ban => ban.expiresAt <= Date.now());
  for (const ban of due) {
    try {
      const guild = client.guilds.cache.get(ban.guildId);
      if (guild) {
        await guild.bans.remove(ban.userId, `Temporary ban expired (Lobster)`).catch(error => {
          if (error.code !== 10026) throw error;
        });
        logEvent(guild, 'ban', {
          title: '⏱️ Temporary ban expired',
          target: `<@${ban.userId}>`,
          description: 'The ban was lifted automatically.',
          userId: ban.userId,
          audit: false
        });
      }
      db.removeTempBan(ban.guildId, ban.userId);
    } catch (error) {
      console.error(`Could not lift temporary ban for ${ban.userId} in ${ban.guildId}:`, error);
    }
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('Lobster · /help', { type: ActivityType.Playing });
  for (const guild of client.guilds.cache.values()) {
    cacheGuildInvites(guild).catch(() => {});
  }
  if (dashboardServer.isConfigured()) {
    dashboardServer.listen(Number(process.env.DASHBOARD_PORT) || 3000)
      .then(() => console.log(`Lobster dashboard API listening on port ${Number(process.env.DASHBOARD_PORT) || 3000}`))
      .catch(error => console.error('Could not start the dashboard API:', error));
  } else {
    console.log('Dashboard API is disabled. Configure Discord OAuth and DASHBOARD_* values to enable it.');
  }
  voiceManager.restore(client).catch(error => console.error('Voice connection restore failed:', error));
  endDueGiveaways().catch(error => console.error('Giveaway recovery failed:', error));
  processDueTempBans().catch(error => console.error('Temporary ban recovery failed:', error));
  const runDueBackups = async () => {
    for (const guild of client.guilds.cache.values()) {
      if (!db.getSettings(guild.id).backupsEnabled || backups.isBackupInProgress(guild.id)) continue;
      try {
        let current;
        try {
          current = backups.readBackup(guild.id);
        } catch (error) {
          console.error(`Could not read the previous backup for ${guild.name} (${guild.id}); trying to create a replacement:`, error);
        }
        if (current && Date.now() - Date.parse(current.createdAt) < backups.BACKUP_INTERVAL_MS) continue;
        await backups.createBackup(guild);
        console.log(`Created scheduled backup for ${guild.name} (${guild.id}).`);
      } catch (error) {
        console.error(`Scheduled backup failed for ${guild.name} (${guild.id}):`, error);
      }
    }
  };
  runDueBackups().catch(error => console.error('Scheduled backup check failed:', error));
  setInterval(() => {
    runDueBackups().catch(error => console.error('Scheduled backup check failed:', error));
  }, 60 * 60 * 1000);
  setInterval(() => {
    endDueGiveaways().catch(error => console.error('Giveaway check failed:', error));
  }, 15000);
  setInterval(() => {
    processDueTempBans().catch(error => console.error('Temporary ban check failed:', error));
  }, 30000);
});

client.on('guildCreate', guild => {
  cacheGuildInvites(guild).catch(() => {});
});

client.on('guildDelete', guild => {
  inviteCache.delete(guild.id);
});

function logTimestamp(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'unknown';
  return `<t:${Math.floor(time / 1000)}:f>`;
}

function quoteContent(text, max = 350) {
  if (!text) return '*no content*';
  const trimmed = text.length > max ? `${text.slice(0, max)}…` : text;
  return `\`\`\`\n${trimmed.replace(/```/g, '`​``')}\n\`\`\``;
}

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  if (!guild?.members?.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return;
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  } catch {}
}

async function findUsedInvite(guild) {
  if (!guild?.members?.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  let invites;
  try {
    invites = await guild.invites.fetch();
  } catch {
    return null;
  }
  const previous = inviteCache.get(guild.id);
  const next = new Map();
  let used = null;
  for (const invite of invites.values()) {
    const uses = invite.uses || 0;
    next.set(invite.code, uses);
    if (previous && uses > (previous.get(invite.code) ?? 0) && !used) used = invite;
  }
  inviteCache.set(guild.id, next);
  return used;
}

function memberRoles(member) {
  return [...member.roles.cache.values()].filter(role => role.id !== member.guild.id);
}

client.on('messageDelete', message => {
  if (!message.guild) return;
  const author = message.author
    ? `${message.author} (\`${message.author.username}\`)`
    : 'unknown';
  logEvent(message.guild, 'message', {
    title: '🗑️ Message deleted',
    target: author,
    description: `**Channel:** <#${message.channelId}>\n${quoteContent(message.content)}`,
    fields: [{ name: 'Message ID', value: `\`${message.id}\``, inline: true }],
    userId: message.author?.id,
    bot: message.author?.bot,
    channelId: message.channelId,
    auditTargetId: message.author?.id
  });
});

client.on('messageDeleteBulk', messages => {
  const first = messages.first();
  if (!first?.guild) return;
  logEvent(first.guild, 'message', {
    title: '🧹 Bulk messages deleted',
    description: `**Channel:** <#${first.channelId}>\n**Messages removed:** **${messages.size}**`,
    fields: [{ name: 'Message ID range', value: `\`${[...messages.keys()].slice(-3).join('`, `')}\`` }],
    channelId: first.channelId,
    auditTargetId: first.channelId
  });
});

client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!newMessage.guild || !newMessage.author) return;
  if (oldMessage.content === newMessage.content) return;
  logEvent(newMessage.guild, 'message', {
    title: '✏️ Message edited',
    target: `${newMessage.author} (\`${newMessage.author.username}\`)`,
    description: `**Channel:** <#${newMessage.channelId}>\n**Before:**\n${quoteContent(oldMessage.content)}\n**After:**\n${quoteContent(newMessage.content)}`,
    fields: [{ name: 'Message ID', value: `\`${newMessage.id}\``, inline: true }],
    userId: newMessage.author.id,
    bot: newMessage.author.bot,
    channelId: newMessage.channelId,
    audit: false
  });
});

function permissionSnapshot(channel) {
  return [...channel.permissionOverwrites.cache.values()]
    .map(overwrite => `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`)
    .sort()
    .join('|');
}

client.on('channelCreate', channel => {
  if (!channel.guild || channel.isThread()) return;
  logEvent(channel.guild, 'channel', {
    title: '📚 Channel created',
    target: `<#${channel.id}> (\`${channel.name}\`)`,
    description: `**Type:** ${channel.type}\n**Category:** ${channel.parent ? `<#${channel.parentId}>` : 'none'}`,
    channelId: channel.id,
    auditTargetId: channel.id
  });
});

client.on('channelDelete', channel => {
  if (!channel.guild || channel.isThread()) return;
  logEvent(channel.guild, 'channel', {
    title: '🗑️ Channel deleted',
    target: `\`${channel.name}\``,
    description: `**Type:** ${channel.type}\n**Category:** ${channel.parent ? `\`${channel.parent.name}\`` : 'none'}`,
    channelId: channel.id,
    auditTargetId: channel.id
  });
  handleChannelRemoval(channel.guild, channel.id);
});

client.on('channelUpdate', (oldChannel, newChannel) => {
  if (!newChannel.guild || newChannel.isThread()) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`name: **${oldChannel.name}** → **${newChannel.name}**`);
  if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) changes.push('channel topic updated');
  if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: **${oldChannel.nsfw ? 'on' : 'off'}** → **${newChannel.nsfw ? 'on' : 'off'}**`);
  if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`slowmode: **${oldChannel.rateLimitPerUser}s** → **${newChannel.rateLimitPerUser}s**`);
  if (oldChannel.parentId !== newChannel.parentId) changes.push('category changed');
  if (permissionSnapshot(oldChannel) !== permissionSnapshot(newChannel)) changes.push('channel permissions updated');
  if (!changes.length) return;
  logEvent(newChannel.guild, 'channel', {
    title: '⚙️ Channel updated',
    target: `<#${newChannel.id}>`,
    description: changes.map(change => `• ${change}`).join('\n'),
    channelId: newChannel.id,
    auditTargetId: newChannel.id
  });
});

client.on('guildMemberRemove', async member => {
  logEvent(member.guild, 'joinleave', {
    title: member.user.bot ? '🤖 Bot left' : '👋 Member left',
    target: `${member} (\`${member.user.username}\`)`,
    fields: [
      { name: 'Joined', value: member.joinedAt ? logTimestamp(member.joinedAt) : 'unknown', inline: true },
      { name: 'Account created', value: logTimestamp(member.user.createdAt), inline: true },
      { name: 'Member count', value: `**${member.guild.memberCount}**`, inline: true }
    ],
    thumbnail: member.user.displayAvatarURL(),
    userId: member.user.id,
    bot: member.user.bot,
    audit: false
  });
  const settings = db.getSettings(member.guild.id);
  if (!settings.farewellEnabled || !settings.farewellChannel) return;
  const channel = member.guild.channels.cache.get(settings.farewellChannel);
  if (!channel?.isTextBased()) return;
  try {
    await channel.send({
      embeds: [farewellEmbed(member, settings)],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error(`Could not send a farewell card for ${member.user.tag}:`, error);
  }
});

client.on('guildMemberAdd', async member => {
  const invite = member.user.bot ? null : await findUsedInvite(member.guild);
  const fields = [
    { name: 'Account created', value: logTimestamp(member.user.createdAt), inline: true },
    { name: 'Member count', value: `**${member.guild.memberCount}**`, inline: true }
  ];
  if (invite) {
    fields.push({
      name: 'Invite used',
      value: `\`${invite.code}\`${invite.inviter ? ` by ${invite.inviter}` : ''}${invite.channel ? ` in <#${invite.channel.id}>` : ''}`,
      inline: false
    });
  }
  logEvent(member.guild, 'joinleave', {
    title: member.user.bot ? '🤖 Bot added' : '👋 Member joined',
    target: `${member} (\`${member.user.username}\`)`,
    fields,
    thumbnail: member.user.displayAvatarURL(),
    userId: member.user.id,
    bot: member.user.bot,
    audit: false
  });
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    logEvent(newMember.guild, 'name', {
      title: '🏷️ Nickname changed',
      target: `${newMember}`,
      description: `**Before:** **${oldMember.nickname || 'none'}**\n**After:** **${newMember.nickname || 'none'}**`,
      userId: newMember.id,
      bot: newMember.user.bot,
      auditTargetId: newMember.id
    });
  }

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter(id => id !== newMember.guild.id && !oldRoles.has(id));
  const removed = [...oldRoles].filter(id => id !== newMember.guild.id && !newRoles.has(id));
  if (added.length || removed.length) {
    const changes = [
      ...added.map(id => `➕ <@&${id}>`),
      ...removed.map(id => `➖ <@&${id}>`)
    ];
    logEvent(newMember.guild, 'role', {
      title: '🎭 Member roles changed',
      target: `${newMember}`,
      description: changes.join('\n'),
      userId: newMember.id,
      bot: newMember.user.bot,
      auditTargetId: newMember.id
    });
  }

  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    const until = newMember.communicationDisabledUntilTimestamp;
    logEvent(newMember.guild, 'timeout', {
      title: until ? '⏱️ Member timed out' : '⏱️ Timeout removed',
      target: `${newMember}`,
      description: until ? `**Ends:** ${logTimestamp(until)}` : 'The timeout was removed.',
      userId: newMember.id,
      bot: newMember.user.bot,
      auditTargetId: newMember.id
    });
  }

  if (!oldMember.premiumSince && newMember.premiumSince) {
    const settings = db.getSettings(newMember.guild.id);
    if (settings.boosterEnabled && settings.boosterChannel) {
      const channel = newMember.guild.channels.cache.get(settings.boosterChannel);
      if (channel?.isTextBased()) {
        const message = settings.boosterMessage.replaceAll('{user}', `${newMember}`).replaceAll('{server}', newMember.guild.name);
        channel.send({ content: message, allowedMentions: { users: [newMember.id] } }).catch(console.error);
      }
    }
  }
});

client.on('roleCreate', role => {
  logEvent(role.guild, 'role', {
    title: '🎭 Role created',
    target: `${role} (\`${role.name}\`)`,
    description: `**Color:** \`${role.hexColor}\`\n**Position:** ${role.rawPosition}`,
    auditTargetId: role.id
  });
});

client.on('roleDelete', role => {
  logEvent(role.guild, 'role', {
    title: '🗑️ Role deleted',
    target: `\`${role.name}\``,
    description: `**Color:** \`${role.hexColor}\`\n**Members:** **${role.members.size}**`,
    auditTargetId: role.id
  });
});

client.on('roleUpdate', (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`name: **${oldRole.name}** → **${newRole.name}**`);
  if (oldRole.hexColor !== newRole.hexColor) changes.push(`color: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
  if (oldRole.hoist !== newRole.hoist) changes.push(`hoisted: **${oldRole.hoist ? 'on' : 'off'}** → **${newRole.hoist ? 'on' : 'off'}**`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`mentionable: **${oldRole.mentionable ? 'on' : 'off'}** → **${newRole.mentionable ? 'on' : 'off'}**`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('role permissions updated');
  if (!changes.length) return;
  logEvent(newRole.guild, 'role', {
    title: '⚙️ Role updated',
    target: `${newRole}`,
    description: changes.map(change => `• ${change}`).join('\n'),
    auditTargetId: newRole.id
  });
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member) return;
  const changes = [];
  if (oldState.channelId !== newState.channelId) {
    if (!oldState.channelId) changes.push(`🔊 joined <#${newState.channelId}>`);
    else if (!newState.channelId) changes.push(`🚪 left <#${oldState.channelId}>`);
    else changes.push(`🔁 <#${oldState.channelId}> → <#${newState.channelId}>`);
  }
  if (oldState.serverMute !== newState.serverMute) changes.push(newState.serverMute ? '🔇 server muted' : '🔈 server unmuted');
  if (oldState.serverDeaf !== newState.serverDeaf) changes.push(newState.serverDeaf ? '🙉 server deafened' : '👂 server undeafened');
  if (oldState.streaming !== newState.streaming) changes.push(newState.streaming ? '📺 started streaming' : '📴 stopped streaming');
  if (oldState.selfVideo !== newState.selfVideo) changes.push(newState.selfVideo ? '📷 turned camera on' : '📹 turned camera off');
  if (!changes.length) return;
  logEvent(member.guild, 'voice', {
    title: '🔊 Voice state updated',
    target: `${member}`,
    description: changes.map(change => `• ${change}`).join('\n'),
    userId: member.id,
    bot: member.user.bot,
    channelId: newState.channelId || oldState.channelId,
    audit: false
  });
});

client.on('emojiCreate', emoji => {
  logEvent(emoji.guild, 'emoji', {
    title: '😄 Emoji added',
    target: `${emoji} (\`:${emoji.name}:\`)`,
    description: `**ID:** \`${emoji.id}\``,
    thumbnail: emoji.imageURL(),
    auditTargetId: emoji.id
  });
});

client.on('emojiDelete', emoji => {
  logEvent(emoji.guild, 'emoji', {
    title: '🗑️ Emoji deleted',
    target: `\`:${emoji.name}:\``,
    description: `**ID:** \`${emoji.id}\``,
    auditTargetId: emoji.id
  });
});

client.on('emojiUpdate', (oldEmoji, newEmoji) => {
  if (oldEmoji.name === newEmoji.name) return;
  logEvent(newEmoji.guild, 'emoji', {
    title: '✏️ Emoji updated',
    target: `${newEmoji}`,
    description: `**Before:** \`:${oldEmoji.name}:\`\n**After:** \`:${newEmoji.name}:\``,
    auditTargetId: newEmoji.id
  });
});

client.on('stickerCreate', sticker => {
  if (!sticker.guild) return;
  logEvent(sticker.guild, 'emoji', {
    title: '🩹 Sticker added',
    target: `**${sticker.name}**`,
    description: `**Description:** ${sticker.description || 'none'}`,
    thumbnail: sticker.imageURL(),
    auditTargetId: sticker.id
  });
});

client.on('stickerDelete', sticker => {
  if (!sticker.guild) return;
  logEvent(sticker.guild, 'emoji', {
    title: '🗑️ Sticker deleted',
    target: `**${sticker.name}**`,
    auditTargetId: sticker.id
  });
});

client.on('stickerUpdate', (oldSticker, newSticker) => {
  if (!newSticker.guild || oldSticker.name === newSticker.name) return;
  logEvent(newSticker.guild, 'emoji', {
    title: '✏️ Sticker updated',
    target: `**${oldSticker.name}** → **${newSticker.name}**`,
    auditTargetId: newSticker.id
  });
});

client.on('threadCreate', thread => {
  if (!thread.guild) return;
  logEvent(thread.guild, 'channel', {
    title: '🧵 Thread created',
    target: `<#${thread.id}> (\`${thread.name}\`)`,
    description: `**Channel:** <#${thread.parentId}>\n**Owner:** ${thread.ownerId ? `<@${thread.ownerId}>` : 'unknown'}`,
    channelId: thread.id,
    auditTargetId: thread.id
  });
});

client.on('threadDelete', thread => {
  if (!thread.guild) return;
  logEvent(thread.guild, 'channel', {
    title: '🗑️ Thread deleted',
    target: `\`${thread.name}\``,
    description: `**Channel:** ${thread.parent ? `<#${thread.parentId}>` : 'unknown'}`,
    channelId: thread.id,
    auditTargetId: thread.id
  });
});

client.on('threadUpdate', (oldThread, newThread) => {
  if (!newThread.guild) return;
  const changes = [];
  if (oldThread.name !== newThread.name) changes.push(`name: **${oldThread.name}** → **${newThread.name}**`);
  if (oldThread.archived !== newThread.archived) changes.push(`archived: **${oldThread.archived ? 'yes' : 'no'}** → **${newThread.archived ? 'yes' : 'no'}**`);
  if (oldThread.locked !== newThread.locked) changes.push(`locked: **${oldThread.locked ? 'yes' : 'no'}** → **${newThread.locked ? 'yes' : 'no'}**`);
  if (!changes.length) return;
  logEvent(newThread.guild, 'channel', {
    title: '⚙️ Thread updated',
    target: `<#${newThread.id}>`,
    description: changes.map(change => `• ${change}`).join('\n'),
    channelId: newThread.id,
    auditTargetId: newThread.id
  });
});

client.on('inviteCreate', invite => {
  if (!invite.guild) return;
  const cache = inviteCache.get(invite.guild.id) || new Map();
  cache.set(invite.code, invite.uses || 0);
  inviteCache.set(invite.guild.id, cache);
  logEvent(invite.guild, 'invite', {
    title: '🔗 Invite created',
    target: `\`${invite.code}\``,
    description: `**Channel:** <#${invite.channelId}>\n**Expires:** ${invite.expiresAt ? logTimestamp(invite.expiresAt) : 'never'}\n**Max uses:** ${invite.maxUses || 'unlimited'}`,
    executor: invite.inviter || null,
    channelId: invite.channelId,
    audit: false
  });
});

client.on('inviteDelete', invite => {
  if (!invite.guild) return;
  const cache = inviteCache.get(invite.guild.id);
  if (cache) cache.delete(invite.code);
  logEvent(invite.guild, 'invite', {
    title: '🗑️ Invite deleted',
    target: `\`${invite.code}\``,
    description: `**Channel:** <#${invite.channelId}>`,
    channelId: invite.channelId
  });
});

client.on('guildUpdate', (oldGuild, newGuild) => {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`name: **${oldGuild.name}** → **${newGuild.name}**`);
  if (oldGuild.icon !== newGuild.icon) changes.push('server icon updated');
  if (oldGuild.banner !== newGuild.banner) changes.push('server banner updated');
  if (oldGuild.ownerId !== newGuild.ownerId) changes.push(`owner: <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`verification level: **${oldGuild.verificationLevel}** → **${newGuild.verificationLevel}**`);
  if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.push('AFK channel changed');
  if (oldGuild.afkTimeout !== newGuild.afkTimeout) changes.push(`AFK timeout: **${oldGuild.afkTimeout}s** → **${newGuild.afkTimeout}s**`);
  if (oldGuild.systemChannelId !== newGuild.systemChannelId) changes.push('system channel changed');
  if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) changes.push('rules channel changed');
  if (oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId) changes.push('announcement channel changed');
  if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) changes.push('notification setting changed');
  if (oldGuild.preferredLocale !== newGuild.preferredLocale) changes.push(`locale: **${oldGuild.preferredLocale}** → **${newGuild.preferredLocale}**`);
  if (!changes.length) return;
  logEvent(newGuild, 'protection', {
    title: '🏠 Server settings updated',
    target: `**${newGuild.name}**`,
    description: changes.map(change => `• ${change}`).join('\n'),
    auditTargetId: newGuild.id
  });
});

client.on('userUpdate', (oldUser, newUser) => {
  const changes = [];
  if (oldUser.username !== newUser.username) changes.push(`username: **${oldUser.username}** → **${newUser.username}**`);
  if (oldUser.globalName !== newUser.globalName) changes.push(`display name: **${oldUser.globalName || 'none'}** → **${newUser.globalName || 'none'}**`);
  if (oldUser.avatar !== newUser.avatar) changes.push('avatar updated');
  if (!changes.length) return;
  for (const guild of client.guilds.cache.values()) {
    if (!guild.members.cache.has(newUser.id)) continue;
    logEvent(guild, 'name', {
      title: '🏷️ User profile updated',
      target: `<@${newUser.id}> (\`${newUser.username}\`)`,
      description: changes.map(change => `• ${change}`).join('\n'),
      thumbnail: newUser.displayAvatarURL(),
      userId: newUser.id,
      bot: newUser.bot,
      audit: false
    });
  }
});

function enumLabel(values, value) {
  return Object.entries(values).find(([, entryValue]) => entryValue === value)?.[0] || String(value ?? 'unknown');
}

client.on('autoModerationActionExecution', execution => {
  if (!execution.guild) return;
  const rule = execution.autoModerationRule;
  const ruleName = rule?.name || `Rule ${execution.ruleId}`;
  const fields = [];
  if (execution.messageId) fields.push({ name: 'Message ID', value: `\`${execution.messageId}\``, inline: true });
  if (execution.matchedKeyword) fields.push({ name: 'Matched keyword', value: `\`${execution.matchedKeyword}\``, inline: true });
  if (execution.matchedContent) fields.push({ name: 'Matched content', value: quoteContent(execution.matchedContent, 500), inline: false });
  logEvent(execution.guild, 'protection', {
    title: '🤖 Discord AutoMod action',
    target: execution.user
      ? `${execution.user} (\`${execution.user.username}\`)`
      : `<@${execution.userId}>`,
    description: `**Rule:** ${ruleName}\n**Trigger:** ${enumLabel(AutoModerationRuleTriggerType, execution.ruleTriggerType)}\n**Action:** ${enumLabel(AutoModerationActionType, execution.action?.type)}\n**Channel:** ${execution.channelId ? `<#${execution.channelId}>` : 'unknown'}\n**Content:**\n${quoteContent(execution.content, 500)}`,
    fields,
    userId: execution.userId,
    bot: Boolean(execution.member?.user?.bot),
    channelId: execution.channelId || undefined,
    audit: false
  });
});

client.on('guildBanAdd', ban => {
  logEvent(ban.guild, 'ban', {
    title: '🔨 Member banned',
    target: `${ban.user} (\`${ban.user.username}\`)`,
    description: ban.reason ? `**Reason:** ${ban.reason}` : undefined,
    thumbnail: ban.user.displayAvatarURL(),
    userId: ban.user.id,
    bot: ban.user.bot,
    auditTargetId: ban.user.id
  });
});

client.on('guildBanRemove', ban => {
  logEvent(ban.guild, 'ban', {
    title: '🔨 Member unbanned',
    target: `${ban.user} (\`${ban.user.username}\`)`,
    thumbnail: ban.user.displayAvatarURL(),
    userId: ban.user.id,
    bot: ban.user.bot,
    auditTargetId: ban.user.id
  });
});

const auditLogCategories = new Map([
  [AuditLogEvent.MemberKick, ['👢 Member kicked', 'kick']],
  [AuditLogEvent.WebhookCreate, ['🪝 Webhook created', 'protection']],
  [AuditLogEvent.WebhookDelete, ['🪝 Webhook deleted', 'protection']],
  [AuditLogEvent.WebhookUpdate, ['🪝 Webhook updated', 'protection']],
  [AuditLogEvent.AutoModerationRuleCreate, ['🚨 AutoMod rule created', 'protection']],
  [AuditLogEvent.AutoModerationRuleUpdate, ['🚨 AutoMod rule updated', 'protection']],
  [AuditLogEvent.AutoModerationRuleDelete, ['🚨 AutoMod rule deleted', 'protection']]
].filter(([action]) => Number.isInteger(action)));

function auditTargetLabel(entry) {
  if (!entry.targetId) return entry.target?.name || 'Unknown';
  if (entry.action === AuditLogEvent.WebhookCreate || entry.action === AuditLogEvent.WebhookDelete || entry.action === AuditLogEvent.WebhookUpdate) {
    return `\`${entry.target?.name || entry.targetId}\``;
  }
  if (entry.action === AuditLogEvent.AutoModerationRuleCreate || entry.action === AuditLogEvent.AutoModerationRuleUpdate || entry.action === AuditLogEvent.AutoModerationRuleDelete) {
    return `**${entry.target?.name || entry.targetId}**`;
  }
  return `<@${entry.targetId}>`;
}

const guardedAuditActions = new Set([
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.EmojiCreate,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.EmojiUpdate
]);

client.on('guildAuditLogEntryCreate', async (entry, guild) => {
  const loggedAction = auditLogCategories.get(entry.action);
  if (loggedAction) {
    await logEvent(guild, loggedAction[1], {
      title: loggedAction[0],
      target: auditTargetLabel(entry),
      executorId: entry.executorId,
      executorTag: entry.executor?.tag || null,
      reason: entry.reason ? entry.reason.slice(0, 500) : null,
      audit: false
    });
  }
  if (!guardedAuditActions.has(entry.action)) return;
  const settings = db.getSettings(guild.id);
  if (!settings.antiNuke.enabled || !entry.executorId || entry.executorId === client.user.id) return;

  try {
    const executor = await guild.members.fetch(entry.executorId).catch(() => null);
    if (!executor || executor.id === guild.ownerId
      || settings.antiNuke.exemptRoleIds.some(roleId => executor.roles.cache.has(roleId))) return;

    const key = `${guild.id}:${executor.id}`;
    const actionCount = recordWindow(
      messageWindows,
      `guard:${key}`,
      Date.now(),
      settings.antiNuke.windowSeconds * 1000
    );
    if (actionCount < settings.antiNuke.limit) return;
    messageWindows.delete(`guard:${key}`);

    const actionName = Object.entries(AuditLogEvent).find(([, value]) => value === entry.action)?.[0] || 'server change';
    let actionTaken = 'The activity exceeded the configured action limit.';
    if (executor.kickable && guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      await executor.kick('Lobster anti-nuke action limit exceeded');
      actionTaken = 'The executor was kicked after exceeding the configured action limit.';
    } else {
      actionTaken += ' The bot could not kick the executor; check role hierarchy and Kick Members permission.';
    }
    await logEvent(guild, 'protection', {
      title: '🚨 Anti-nuke alert',
      target: `<@${executor.id}> (\`${executor.user.tag}\`)`,
      description: `The action limit was exceeded while performing **${actionName}**.\n${actionTaken}`,
      thumbnail: executor.user.displayAvatarURL(),
      audit: false
    });
  } catch (error) {
    console.error(`Anti-nuke check failed in guild ${guild.id}:`, error);
  }
});

async function logReaction(reaction, user, added) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const guild = reaction.message.guild;
    if (!guild) return;
    const config = getLogConfig(guild.id);
    if (!config.enabled || !config.types.reaction.enabled) return;
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name;
    logEvent(guild, 'reaction', {
      title: added ? '💠 Reaction added' : '💠 Reaction removed',
      target: `${user} (\`${user.username}\`)`,
      description: `**Emoji:** ${emoji}\n**Channel:** <#${message.channelId}>\n**Message:** [Jump to message](https://discord.com/channels/${guild.id}/${message.channelId}/${message.id})`,
      userId: user.id,
      channelId: message.channelId,
      audit: false
    });
  } catch {}
}

client.on('messageReactionAdd', (reaction, user) => {
  handleReactionRole(reaction, user, true);
  logReaction(reaction, user, true);
});

client.on('messageReactionRemove', (reaction, user) => {
  handleReactionRole(reaction, user, false);
  logReaction(reaction, user, false);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  try {
    const settings = db.getSettings(message.guild.id);
    const afk = db.getAFK(message.author.id, message.guild.id);
    if (afk) {
      db.removeAFK(message.author.id, message.guild.id);
      temporaryReply(message.reply(styleCommandPayload('afk', message.guild, {
        content: '🦞 Welcome back! I removed your AFK status.'
      })));
    }

    for (const user of message.mentions.users.values()) {
      const mentionedAFK = db.getAFK(user.id, message.guild.id);
      if (!mentionedAFK) continue;
      const elapsed = Math.floor((Date.now() - mentionedAFK.timestamp) / 1000);
      temporaryReply(message.reply(styleCommandPayload('afk', message.guild, {
        content: `**${user.tag}** is AFK: ${mentionedAFK.reason} (${elapsed}s ago).`
      })));
    }

    if (await checkAutomod(message, settings)) return;

    if (settings.counting && message.channel.id === settings.countingChannel) {
      const trimmed = message.content.trim();
      if (!/^\d+$/.test(trimmed)) {
        try {
          await message.delete();
        } catch (error) {
          console.error('Could not delete invalid counting message:', error);
        }
        return;
      }
      const number = Number(trimmed);
      if (Number.isSafeInteger(number) && number === settings.lastCount + 1 && message.author.id !== settings.lastCounter) {
        db.updateSetting(message.guild.id, 'lastCount', number);
        db.updateSetting(message.guild.id, 'lastCounter', message.author.id);
        try {
          await message.react('✅');
        } catch (error) {
          console.error('Could not react to counting message:', error);
        }
      } else {
        try {
          await message.delete();
        } catch (error) {
          console.error('Could not delete wrong counting message:', error);
        }
      }
      return;
    }

    const lowerContent = message.content.toLowerCase();
    const automaticReply = Object.entries(db.getAutoReplies(message.guild.id))
      .filter(([trigger]) => lowerContent.includes(trigger.toLowerCase()))
      .sort(([first], [second]) => second.length - first.length)[0];
    if (automaticReply) {
      await message.reply({
        content: automaticReply[1].replaceAll('{user}', `${message.author}`).replaceAll('{server}', message.guild.name),
        allowedMentions: { parse: [], users: [message.author.id] }
      });
    }

    const prefix = settings.prefix || 'l';
    if (message.content.toLowerCase().startsWith(prefix.toLowerCase())) {
      const args = parseArguments(message.content.slice(prefix.length).trim());
      const commandName = args.shift()?.toLowerCase();
      const command = client.commands.get(commandName)
        || client.commands.get(client.aliases.get(commandName));
      if (command) {
        await executeCommand(command, {
          client,
          message,
          interaction: null,
          guild: message.guild,
          member: message.member,
          user: message.author,
          channel: message.channel,
          isSlash: false,
          args
        });
      }
      return;
    }

    if (!settings.levelsEnabled || (!message.content.trim() && !message.attachments.size)) return;
    const result = db.awardXP(
      message.guild.id,
      message.author.id,
      Math.floor(Math.random() * 11) + 15,
      60000
    );
    if (result && result.level > result.oldLevel) {
      const preferredChannel = settings.levelUpChannel
        ? message.guild.channels.cache.get(settings.levelUpChannel)
        : message.channel;
      const preferredPermissions = preferredChannel?.permissionsFor(message.guild.members.me);
      const levelChannel = preferredChannel?.isTextBased()
        && preferredPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
        ? preferredChannel
        : message.channel;
      await logEvent(message.guild, 'level', {
        title: '📈 Level up',
        target: `${message.author} (\`${message.author.username}\`)`,
        description: `Reached **level ${result.level}**.`,
        thumbnail: message.author.displayAvatarURL(),
        userId: message.author.id,
        channelId: message.channelId,
        audit: false
      });
      if (levelChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0x5BA6FB)
          .setAuthor({ name: 'Level up!', iconURL: message.author.displayAvatarURL() })
          .setTitle('🦞 Level up!')
          .setDescription(`${message.author} reached **level ${result.level}**. Keep the good conversations going!`)
          .setFooter({ text: '🦞 Lobster' });
        const levelNotice = await levelChannel.send({
          ...styleCommandPayload('levels', message.guild, {
            embeds: [embed],
            allowedMentions: { users: [message.author.id] }
          })
        });
        setTimeout(() => levelNotice.delete().catch(error => {
          if (error.code !== 10008) console.error('Could not remove level-up notice:', error);
        }), 3000);
      }
    }
  } catch (error) {
    console.error('Message handler failed:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (await handleLogInteraction(interaction)) return;

  if (interaction.isChatInputCommand()) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Commands can only be used in a server.', ephemeral: true });
      return;
    }
    const command = client.commands.get(interaction.commandName)
      || client.commands.get(client.aliases.get(interaction.commandName));
    if (!command) return;
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(error => {
        console.error(`Could not load member ${interaction.user.id} in ${interaction.guildId}:`, error);
        return null;
      });
    if (!member) {
      await interaction.reply({ content: 'I could not load your server member details. Please try again.', ephemeral: true });
      return;
    }
    await executeCommand(command, {
      client,
      message: null,
      interaction,
      guild: interaction.guild,
      member,
      user: interaction.user,
      channel: interaction.channel,
      isSlash: true,
      args: []
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'lobster_help_category') {
    try {
      await interaction.deferUpdate();
      const category = interaction.values[0];
      if (category !== 'Home' && !Object.hasOwn(CATEGORIES, category)) {
        await interaction.followUp({ content: 'That help category is no longer available. Run `/help` to open a new menu.', ephemeral: true });
        return;
      }
      const prefix = db.getSettings(interaction.guildId).prefix || 'l';
      const embed = category === 'Home'
        ? overviewEmbed(client, prefix, interaction.guild)
        : categoryEmbed(category, client.commands.filter(command => commandCategory(command) === category), prefix, interaction.guild, client);
      await interaction.editReply(stylePayload(client.commands.get('help'), {
        embeds: [embed],
        components: [categoryMenu(), helpButtons()]
      }, { client, guild: interaction.guild, isSlash: true }));
    } catch (error) {
      if (error.code === 10062 || error.code === 40060) {
        console.warn(`Help menu interaction expired or was already acknowledged (${error.code}).`);
        return;
      }
      console.error('Help menu interaction failed:', error);
      if (interaction.deferred || interaction.replied) {
        try {
          await interaction.followUp({ content: 'The help menu could not be updated. Run `/help` to open a new one.', ephemeral: true });
        } catch (responseError) {
          if (responseError.code !== 10062 && responseError.code !== 40060) {
            console.error('Could not report the help menu error:', responseError);
          }
        }
      }
    }
    return;
  }

  if (interaction.isUserSelectMenu() && ['ticket_add_select', 'ticket_remove_select'].includes(interaction.customId)) {
    try {
      const settings = db.getSettings(interaction.guildId);
      const ticketMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const ticketOwnerId = ticketOwnerIdFromTopic(interaction.channel.topic);
      if (!ticketOwnerId) {
        await interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
        return;
      }
      const isStaff = ticketMember && ((settings.ticketAdminRole && ticketMember.roles.cache.has(settings.ticketAdminRole))
        || ticketMember.permissions.has(PermissionFlagsBits.ManageChannels));
      if (!isStaff && interaction.user.id !== ticketOwnerId) {
        await interaction.reply({ content: 'Only the ticket creator or server staff can manage ticket members.', ephemeral: true });
        return;
      }
      const add = interaction.customId === 'ticket_add_select';
      const target = await interaction.guild.members.fetch(interaction.values[0]).catch(() => null);
      if (!target) {
        await interaction.reply({ content: 'I could not find that member in this server.', ephemeral: true });
        return;
      }
      if (target.id === client.user.id) {
        await interaction.reply({ content: 'I am already in every ticket.', ephemeral: true });
        return;
      }
      if (!add && target.id === ticketOwnerId) {
        await interaction.reply({ content: 'The ticket creator owns this ticket and cannot be removed.', ephemeral: true });
        return;
      }
      if (add) {
        await interaction.channel.permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }, { reason: `Ticket member added by ${interaction.user.tag}` });
      } else {
        await interaction.channel.permissionOverwrites.delete(target.id, `Ticket member removed by ${interaction.user.tag}`)
          .catch(() => {});
      }
      await interaction.reply({
        content: add ? `Added ${target} to the ticket.` : `Removed ${target} from the ticket.`,
        allowedMentions: { parse: [] },
        ephemeral: true
      });
    } catch (error) {
      console.error('Ticket member management failed:', error);
      const payload = { content: 'That action failed. Check my Manage Channels permission.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'lobster_help_category') {
    try {
      await interaction.deferUpdate();
      const category = interaction.values[0];
      if (category !== 'Home' && !Object.hasOwn(CATEGORIES, category)) {
        await interaction.followUp({ content: 'That help category is no longer available. Run `/help` to open a new menu.', ephemeral: true });
        return;
      }
      const prefix = db.getSettings(interaction.guildId).prefix || 'l';
      const embed = category === 'Home'
        ? overviewEmbed(client, prefix, interaction.guild)
        : categoryEmbed(category, client.commands.filter(command => commandCategory(command) === category), prefix, interaction.guild, client);
      await interaction.editReply(stylePayload(client.commands.get('help'), {
        embeds: [embed],
        components: [categoryMenu(), helpButtons()]
      }, { client, guild: interaction.guild, isSlash: true }));
    } catch (error) {
      if (error.code === 10062 || error.code === 40060) {
        console.warn(`Help menu interaction expired or was already acknowledged (${error.code}).`);
        return;
      }
      console.error('Help menu interaction failed:', error);
      if (interaction.deferred || interaction.replied) {
        try {
          await interaction.followUp({ content: 'The help menu could not be updated. Run `/help` to open a new menu.', ephemeral: true });
        } catch (responseError) {
          console.error(`Could not report the help menu error: ${responseError.code}`);
        }
      }
      return;
    }
    return;
  }

  if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('ship:')) {
      if (interaction.message.author.id !== client.user.id) return;

      if (interaction.customId.startsWith('ship:delete:')) {
        const deleteMatch = interaction.customId.match(/^ship:delete:(\d{17,20})$/);
        if (!deleteMatch || interaction.user.id !== deleteMatch[1]) {
          await interaction.reply({ content: 'You cannot delete this ship card.', ephemeral: true }).catch(() => {});
          return;
        }
        try {
          await interaction.deferUpdate();
          await interaction.message.delete();
        } catch (error) {
          console.error('Delete ship error:', error);
        }
        return;
      }

      if (interaction.customId.startsWith('ship:again:')) {
        await interaction.reply({ content: 'Ship rerolling is temporarily disabled for maintenance. Please use `/ship` to create a new one.', ephemeral: true }).catch(() => {});
        return;
      }
      return;
    }
  if (interaction.customId === 'verification_verify') {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Verification can only be completed in a server.', ephemeral: true });
      return;
    }
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if (verifyingMembers.has(key)) {
      await interaction.reply({ content: 'Your verification is already being processed. Please wait.', ephemeral: true });
      return;
    }
    verifyingMembers.add(key);
    try {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      const settings = db.getSettings(guild.id);
      if (!settings.verificationEnabled || !settings.verificationRole || !settings.unverifiedRole) {
        await interaction.editReply('Verification is not currently configured. Please contact a server administrator.');
        return;
      }
      const member = await guild.members.fetch(interaction.user.id);
      const verifiedRole = guild.roles.cache.get(settings.verificationRole);
      const unverifiedRole = guild.roles.cache.get(settings.unverifiedRole);
      const quarantineRole = settings.quarantineRole
        ? guild.roles.cache.get(settings.quarantineRole)
        : null;
      const rolesToManage = [verifiedRole, unverifiedRole, ...(settings.quarantineRole ? [quarantineRole] : [])];
      if (rolesToManage.some(role => !role || role.managed || !role.editable)
        || !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.editReply('Lobster cannot manage the configured verification roles. Ask an administrator to check its role hierarchy and permissions.');
        return;
      }
      const rolesToRemove = [unverifiedRole, quarantineRole].filter(role => role && member.roles.cache.has(role.id));
      if (rolesToRemove.length) {
        await member.roles.remove(rolesToRemove, 'Member completed Lobster Discord verification');
      }
      if (!member.roles.cache.has(verifiedRole.id)) {
        await member.roles.add(verifiedRole, 'Member completed Lobster Discord verification');
      }
      await interaction.editReply('You are verified. Welcome to the server!');
      if (settings.verificationLogChannel) {
        const logChannel = guild.channels.cache.get(settings.verificationLogChannel);
        if (logChannel?.isTextBased() && logChannel.permissionsFor(guild.members.me)?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks
        ])) {
          try {
            await logChannel.send({
              embeds: [new EmbedBuilder()
                .setColor(0x43b581)
                .setTitle('Member verified')
                .setDescription(`<@${member.id}> completed Discord verification.`)
                .setTimestamp()],
              allowedMentions: { users: [member.id] }
            });
          } catch (error) {
            console.error(`Could not write verification log for ${member.user.tag}:`, error);
          }
        } else {
          console.error(`Could not write verification log for ${member.user.tag}: log channel permissions or configuration are invalid.`);
        }
      }
    } catch (error) {
      console.error(`Verification failed for ${interaction.user.tag}:`, error);
      const message = 'Verification could not be completed. Please ask a server administrator to check Lobster’s role permissions.';
      if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(console.error);
      else await interaction.reply({ content: message, ephemeral: true }).catch(console.error);
    } finally {
      verifyingMembers.delete(key);
    }
    return;
  }
  if (['ticket_add', 'ticket_remove', 'ticket_call'].includes(interaction.customId)) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Ticket controls only work in a server.', ephemeral: true });
      return;
    }
    const settings = db.getSettings(interaction.guildId);
    const ticketMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const ticketOwnerId = ticketOwnerIdFromTopic(interaction.channel.topic);
    if (!ticketOwnerId) {
      await interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
      return;
    }
    const isStaff = ticketMember && ((settings.ticketAdminRole && ticketMember.roles.cache.has(settings.ticketAdminRole))
      || ticketMember.permissions.has(PermissionFlagsBits.ManageChannels));
    const isOwner = interaction.user.id === ticketOwnerId;
    if (!isStaff && !isOwner) {
      await interaction.reply({ content: 'Only the ticket creator or server staff can use these controls.', ephemeral: true });
      return;
    }
    if (interaction.customId === 'ticket_call') {
      const staffRole = settings.ticketAdminRole ? interaction.guild.roles.cache.get(settings.ticketAdminRole) : null;
      await interaction.reply({
        content: staffRole
          ? `${staffRole} — ${interaction.user} is requesting assistance in this ticket.`
          : `${interaction.user} is requesting staff assistance in this ticket.`,
        allowedMentions: staffRole ? { roles: [staffRole.id] } : { parse: [] }
      });
      return;
    }
    const add = interaction.customId === 'ticket_add';
    const menu = new UserSelectMenuBuilder()
      .setCustomId(add ? 'ticket_add_select' : 'ticket_remove_select')
      .setPlaceholder(add ? 'Choose a member to add to this ticket' : 'Choose a member to remove from this ticket')
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: add ? 'Select the member to add to this ticket.' : 'Select the member to remove from this ticket.',
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
    return;
  }

  if (!['giveaway_join', 'ticket_open', 'ticket_close'].includes(interaction.customId)) return;
  interaction = styledContext(
    client.commands.get(interaction.customId === 'giveaway_join' ? 'giveaway' : 'ticket-panel'),
    {
      client,
      guild: interaction.guild,
      member: interaction.member,
      user: interaction.user,
      channel: interaction.channel,
      message: null,
      interaction,
      isSlash: true,
      args: []
    }
  ).interaction;

  try {
    if (interaction.customId === 'giveaway_join') {
      const giveaway = db.getGiveaway(interaction.message.id);
      const joined = db.addParticipant(interaction.message.id, interaction.user.id);
      await interaction.reply({
        content: joined
          ? 'You have joined the giveaway!'
          : (!giveaway || giveaway.ended || giveaway.endTime <= Date.now()
            ? 'This giveaway has ended.'
            : 'You have already joined this giveaway.'),
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === 'ticket_open') {
      if (openingTickets.has(`${interaction.guildId}:${interaction.user.id}`)) {
        await interaction.reply({ content: 'I am already opening your ticket. Please wait a moment.', ephemeral: true });
        return;
      }
      openingTickets.add(`${interaction.guildId}:${interaction.user.id}`);
      try {
        await interaction.deferReply({ ephemeral: true });
        const settings = db.getSettings(interaction.guildId);
        const category = interaction.guild.channels.cache.get(settings.ticketCategory);
        const staffRole = interaction.guild.roles.cache.get(settings.ticketAdminRole);
        if (!category || !staffRole) {
          await interaction.editReply('The ticket system is not configured correctly. Ask a server administrator to run `/ticket-panel` again.');
          return;
        }

        const existingTicket = interaction.guild.channels.cache.find(channel =>
          ticketOwnerIdFromTopic(channel.topic) === interaction.user.id
        );
        if (existingTicket) {
          await interaction.editReply(`You already have an open ticket: ${existingTicket}`);
          return;
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 85)}`,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: ticketTopic(interaction.user.id),
          permissionOverwrites: [
            { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
              id: staffRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
            }
          ]
        });
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_add')
            .setLabel('Add member')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('ticket_remove')
            .setLabel('Remove member')
            .setEmoji('➖')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('ticket_call')
            .setLabel('Call staff')
            .setEmoji('📣')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Close ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );
        const prompt = (settings.ticketPrompt || 'Thanks for reaching out, {user}. Please describe your issue.')
          .replaceAll('{user}', `${interaction.user}`)
          .replaceAll('{server}', interaction.guild.name);
        await ticketChannel.send({
          ...styleCommandPayload('ticket-panel', interaction.guild, {
            content: `${interaction.user}`,
            embeds: [new EmbedBuilder()
              .setAuthor({
                name: `🎫 ${interaction.guild.name} · Support`,
                iconURL: interaction.guild.iconURL() || undefined
              })
              .setTitle('🎫 Support request')
              .setDescription(prompt)
              .setColor(0x5BA6FB)
              .addFields(
                { name: '👤 Opened by', value: `${interaction.user}`, inline: true },
                { name: '🕒 Opened', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                { name: '🚩 Priority', value: '🟡 Normal', inline: true }
              )
              .setFooter({ text: 'Use the button below to close this ticket once it is solved.' })
              .setTimestamp()],
            components: [closeRow],
            allowedMentions: { users: [interaction.user.id] }
          })
        });
        await interaction.editReply(`Your private ticket is ready: ${ticketChannel}`);
        logEvent(interaction.guild, 'ticket', {
          title: '🎫 Ticket opened',
          target: `${interaction.user} (\`${interaction.user.username}\`)`,
          description: `**Channel:** ${ticketChannel}\n**Name:** \`${ticketChannel.name}\``,
          executor: interaction.user,
          channelId: ticketChannel.id,
          audit: false
        });
      } finally {
        openingTickets.delete(`${interaction.guildId}:${interaction.user.id}`);
      }
      return;
    }

    if (interaction.customId === 'ticket_close') {
      const settings = db.getSettings(interaction.guildId);
      const ticketMember = await interaction.guild.members.fetch(interaction.user.id);
      const ticketOwnerId = ticketOwnerIdFromTopic(interaction.channel.topic);
      if (!ticketOwnerId) {
        await interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
        return;
      }
      const isOwner = ticketOwnerId === interaction.user.id;
      const isStaff = settings.ticketAdminRole && ticketMember.roles.cache.has(settings.ticketAdminRole);
      const canManage = ticketMember.permissions.has(PermissionFlagsBits.ManageChannels);
      if (!isOwner && !isStaff && !canManage) {
        await interaction.reply({ content: 'Only the ticket creator or server staff can close this ticket.', ephemeral: true });
        return;
      }
      const transcriptChannel = settings.ticketTranscriptChannel
        ? interaction.guild.channels.cache.get(settings.ticketTranscriptChannel)
        : null;
      if (settings.ticketTranscriptChannel && (!transcriptChannel?.isTextBased()
        || !transcriptChannel.permissionsFor(interaction.guild.members.me)
          ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]))) {
        await interaction.reply({
          content: 'The configured transcript channel is unavailable or missing permissions. Ask an administrator to update `/ticket-panel`; this ticket is still open.',
          ephemeral: true
        });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      if (transcriptChannel) {
        const transcript = await createTicketTranscript(interaction.channel);
        await transcriptChannel.send(styleCommandPayload('ticket-panel', interaction.guild, {
          embeds: [new EmbedBuilder()
            .setColor(0x5BA6FB)
            .setTitle('Ticket transcript')
            .setDescription(`Transcript for **#${interaction.channel.name}**\nOpened by <@${ticketOwnerId}> · Closed by <@${interaction.user.id}>.`)],
          files: [transcript],
          allowedMentions: { parse: [] }
        }));
      }
      await interaction.editReply(transcriptChannel
        ? `Transcript saved in ${transcriptChannel}. This ticket will close in 5 seconds.`
        : 'Ticket transcripts are disabled. This ticket will close in 5 seconds.');
      logEvent(interaction.guild, 'ticket', {
        title: '🎫 Ticket closed',
        target: `**#${interaction.channel.name}**`,
        description: `**Owner:** <@${ticketOwnerId}>\n**Closed by:** ${interaction.user}${transcriptChannel ? `\n**Transcript:** ${transcriptChannel}` : ''}`,
        executor: interaction.user,
        channelId: interaction.channelId,
        audit: false
      });
      setTimeout(() => interaction.channel.delete('Ticket closed').catch(error => {
        console.error('Could not close ticket channel:', error);
      }), 5000);
    }
  } catch (error) {
    console.error(`Component "${interaction.customId}" failed:`, error);
    const payload = { content: 'That action failed. Check the bot permissions and try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

client.on('guildMemberAdd', async member => {
  const settings = db.getSettings(member.guild.id);
  if (member.id === client.user.id) return;
  const tooNew = settings.minAccountAgeDays > 0
    && Date.now() - member.user.createdTimestamp < settings.minAccountAgeDays * 86400000;
  if (tooNew || (member.user.bot && settings.blockBots)) {
    const reason = tooNew
      ? `Account is younger than ${settings.minAccountAgeDays} days`
      : 'Bot accounts are blocked by server security settings';
    if (!member.kickable) {
      console.error(`Could not enforce join security for ${member.user.tag}: bot role is below the new member's highest role.`);
      return;
    }
    try {
      await member.kick(reason);
      await logEvent(member.guild, 'protection', {
        title: '🚨 Join security',
        target: `${member} (\`${member.user.tag}\`)`,
        description: `A new member was removed: ${reason}.`,
        userId: member.id,
        bot: member.user.bot,
        audit: false
      });
    } catch (error) {
      console.error(`Could not enforce join security for ${member.user.tag}:`, error);
    }
    return;
  }

  if (settings.joinRaidProtection.enabled) {
    const key = `join-guard:${member.guild.id}`;
    const joinCount = recordWindow(
      joinWindows,
      key,
      Date.now(),
      settings.joinRaidProtection.windowSeconds * 1000
    );
    if (joinCount > settings.joinRaidProtection.limit) {
      const now = Date.now();
      const alertUntil = joinRaidAlerts.get(member.guild.id) || 0;
      const shouldLogAlert = alertUntil <= now;
      if (shouldLogAlert) {
        joinRaidAlerts.set(member.guild.id, now + settings.joinRaidProtection.windowSeconds * 1000);
        if (joinRaidAlerts.size > 10000) {
          const oldestGuildId = joinRaidAlerts.keys().next().value;
          joinRaidAlerts.delete(oldestGuildId);
        }
      }
      if (!member.kickable) {
        console.error(`Could not enforce join raid protection for ${member.user.tag}: bot role is below the new member's highest role.`);
        if (shouldLogAlert) {
          await logEvent(member.guild, 'protection', {
            title: '🚨 Join raid protection',
            target: `${member} (\`${member.user.tag}\`)`,
            description: `Join rate exceeded ${settings.joinRaidProtection.limit} members in ${settings.joinRaidProtection.windowSeconds} seconds, but the member could not be kicked. Check Lobster’s role hierarchy and Kick Members permission.`,
            userId: member.id,
            bot: member.user.bot,
            audit: false
          });
        }
        return;
      }
      try {
        await member.kick('Lobster join raid protection: server join rate exceeded the configured limit');
        if (shouldLogAlert) {
          await logEvent(member.guild, 'protection', {
            title: '🚨 Join raid protection',
            target: `${member} (\`${member.user.tag}\`)`,
            description: `The member triggered the join-rate guard after the server exceeded ${settings.joinRaidProtection.limit} joins in ${settings.joinRaidProtection.windowSeconds} seconds. Further eligible joiners are temporarily blocked.`,
            userId: member.id,
            bot: member.user.bot,
            audit: false
          });
        }
      } catch (error) {
        console.error(`Could not enforce join raid protection for ${member.user.tag}:`, error);
      }
      return;
    }
  }

  if (settings.verificationEnabled) {
    const unverifiedRole = settings.unverifiedRole
      ? member.guild.roles.cache.get(settings.unverifiedRole)
      : null;
    if (!unverifiedRole || unverifiedRole.managed || !unverifiedRole.editable
      || !member.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.error(`Could not assign the unverified role to ${member.user.tag}: check the verification settings and Lobster's role hierarchy.`);
      await logEvent(member.guild, 'protection', {
        title: '🚨 Verification setup issue',
        target: `${member} (\`${member.user.tag}\`)`,
        description: 'Could not assign the unverified role. Check the configured role and Lobster’s role hierarchy.',
        userId: member.id,
        bot: member.user.bot,
        audit: false
      });
    } else {
      try {
        await member.roles.add(unverifiedRole, 'New member is pending Lobster verification');
      } catch (error) {
        console.error(`Could not assign the unverified role to ${member.user.tag}:`, error);
      }
    }
  }

  const role = !settings.verificationEnabled && settings.autorole
    ? member.guild.roles.cache.get(settings.autorole)
    : null;
  if (role) {
    try {
      await member.roles.add(role, 'Configured Lobster autorole');
    } catch (error) {
      console.error(`Could not assign autorole to ${member.user.tag}:`, error);
    }
  }

  if (!settings.welcomer || !settings.welcomeChannel) return;
  const channel = member.guild.channels.cache.get(settings.welcomeChannel);
  if (!channel?.isTextBased()) return;
  try {
    await channel.send({
      embeds: [welcomeEmbed(member, settings)],
      allowedMentions: { users: [member.id] }
    });
  } catch (error) {
    console.error(`Join handler failed for ${member.user.tag}:`, error);
  }
});

client.login(process.env.TOKEN).catch(error => {
  console.error('Could not log in to Discord:', error);
  process.exitCode = 1;
});
