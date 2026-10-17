const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../utils/database');
const { stylePayload } = require('../utils/command-style');

const LAYOUT = [
  {
    name: '🛡️・PRIVATE',
    staffOnly: true,
    channels: [
      { key: 'mod-logs', name: '📋・mod-logs', topic: 'Moderation actions and AutoMod alerts.', readOnly: true },
      { key: 'audit-logs', name: '🗒️・audit-logs', topic: 'Server event logs: members, roles, channels, and voice.', readOnly: true },
      { key: 'ticket-logs', name: '🎫・ticket-logs', topic: 'Private ticket transcripts.', readOnly: true },
      { key: 'staff-announcements', name: '📢・staff-announcements', topic: 'Internal staff announcements.', readOnly: true },
      { key: 'staff-chat', name: '💬・staff-chat', topic: 'Private staff discussion.' },
      { key: 'staff-voice', name: '🔊・Staff Voice', type: 'voice' }
    ]
  },
  {
    name: '📌・INFORMATION',
    staffOnly: false,
    channels: [
      { key: 'rules', name: '📜・rules', topic: 'Read the server rules.', readOnly: true },
      { key: 'announcements', name: '📢・announcements', topic: 'Official server announcements.', readOnly: true },
      { key: 'welcome', name: '👋・welcome', topic: 'Welcome new members here.', readOnly: true },
      { key: 'commands', name: '🤖・commands', topic: 'Use bot commands here.', readOnly: true }
    ]
  },
  {
    name: '💬・COMMUNITY',
    staffOnly: false,
    channels: [
      { key: 'general', name: '💬・general', topic: 'General chat.' },
      { key: 'media', name: '🖼️・media', topic: 'Share images and videos.' },
      { key: 'memes', name: '😂・memes', topic: 'Post your best memes.' },
      { key: 'memories', name: '📸・memories', topic: 'Save your favourite server memories.' },
      { key: 'counting', name: '🔢・counting', topic: 'Count together, one number at a time.' },
      { key: 'support', name: '🎫・support', topic: 'Open a private support ticket with the button below.' }
    ]
  },
  {
    name: '🔊・VOICE',
    staffOnly: false,
    channels: [
      { key: 'general-voice', name: '🔊 General', type: 'voice' },
      { key: 'gaming-voice', name: '🎮 Gaming', type: 'voice' },
      { key: 'music-voice', name: '🎵 Music', type: 'voice' },
      { key: 'afk-voice', name: '😴 AFK', type: 'voice' }
    ]
  }
];

const BASIC_MEMBER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD
];

const ROLES = [
  { name: 'Owner', color: 0xE74C3C, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.Administrator] },
  { name: 'Admin', color: 0x992D22, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.Administrator] },
  { name: 'Bots', color: 0x5865F2, hoist: true, mentionable: false, permissions: BASIC_MEMBER_PERMS },
  { name: 'Head Moderator', color: 0x111111, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageThreads] },
  { name: 'Moderator', color: 0x1ABC9C, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers] },
  { name: 'Premium', color: 0xE67E22, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.UseExternalStickers, PermissionFlagsBits.ChangeNickname, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.PrioritySpeaker] },
  { name: 'Support', color: 0xF1C40F, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ModerateMembers] },
  { name: 'Sponsors', color: 0x2ECC71, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.ChangeNickname] },
  { name: 'Supporters', color: 0x9ACD32, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ChangeNickname] },
  { name: 'Special Member', color: 0xFEE75C, hoist: true, mentionable: true, permissions: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.UseExternalStickers, PermissionFlagsBits.ChangeNickname, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.PrioritySpeaker] },
  { name: 'Testers', color: 0x95A5A6, hoist: false, mentionable: true, permissions: BASIC_MEMBER_PERMS },
  { name: 'Developers', color: 0x27AE60, hoist: true, mentionable: false, permissions: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
  { name: 'Member', color: 0xBDC3C7, hoist: false, mentionable: false, permissions: BASIC_MEMBER_PERMS },
  { name: 'Users', color: 0x95A5A6, hoist: false, mentionable: false, permissions: BASIC_MEMBER_PERMS },
  { name: 'Systems', color: 0x95A5A6, hoist: false, mentionable: false, permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageWebhooks] }
];

const REMOVED_ROLES = ['Verified', 'Voters'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create a ready-to-use channel and role layout for your server'),
  category: 'General',
  permissions: [PermissionFlagsBits.Administrator],
  botPermissions: [
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],
  async run({ interaction, message, isSlash, guild }) {
    let progressMessage;
    if (isSlash) await interaction.deferReply({ ephemeral: true });
    else progressMessage = await message.reply('Setting up your starter layout…');

    const me = guild.members.me;
    const getOrCreateRole = async (spec) => {
      if (!spec || typeof spec.name !== 'string') return null;
      const name = spec.name;
      const roleSpec = {
        name,
        color: spec.color,
        hoist: !!spec.hoist,
        mentionable: !!spec.mentionable,
        permissions: spec.permissions || [],
        reason: 'Lobster starter server setup'
      };
      let role = guild.roles.cache.find(existing => existing.name === name);
      if (!role) {
        try {
          role = await guild.roles.create(roleSpec);
        } catch (error) {
          console.error(`Could not create role ${name}:`, error);
          return null;
        }
        return role;
      }
      if (role.editable) {
        try {
          await role.edit({
            color: roleSpec.color,
            hoist: roleSpec.hoist,
            mentionable: roleSpec.mentionable,
            permissions: roleSpec.permissions
          });
        } catch (error) {
          console.error(`Could not update role ${name}:`, error);
        }
      }
      return role;
    };
    const getOrCreateCategory = async spec => {
      let category = guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory && channel.name === spec.name
      );
      if (!category) {
        category = await guild.channels.create({
          name: spec.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: spec.staffOnly ? (() => {
            const overwrites = [
              { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              {
                id: staffRole.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              }
            ];
            const headMod = guild.roles.cache.find(r => r.name === 'Head Moderator');
            const support = guild.roles.cache.find(r => r.name === 'Support');
            if (headMod) {
              overwrites.push({
                id: headMod.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              });
            }
            if (support) {
              overwrites.push({
                id: support.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              });
            }
            overwrites.push({
              id: me.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageChannels
              ]
            });
            return overwrites;
          })() : undefined,
          reason: 'Lobster starter server setup'
        });
      }
      return category;
    };
    const channelOverwrites = (spec, channelSpec) => {
      const everyone = guild.id;
      if (spec.staffOnly && channelSpec.type === 'voice') {
        return [
          { id: everyone, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
          { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: (guild.roles.cache.find(r => r.name === 'Head Moderator')?.id || staffRole.id), allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: (guild.roles.cache.find(r => r.name === 'Support')?.id || staffRole.id), allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
        ];
      }
      if (spec.staffOnly) {
        return [
          { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: staffRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: (guild.roles.cache.find(r => r.name === 'Head Moderator')?.id || staffRole.id),
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: (guild.roles.cache.find(r => r.name === 'Support')?.id || staffRole.id),
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ];
      }
      if (channelSpec.readOnly) {
        return [
          { id: everyone, deny: [PermissionFlagsBits.SendMessages] },
          { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] },
          { id: (guild.roles.cache.find(r => r.name === 'Head Moderator')?.id || staffRole.id), allow: [PermissionFlagsBits.SendMessages] },
          { id: (guild.roles.cache.find(r => r.name === 'Support')?.id || staffRole.id), allow: [PermissionFlagsBits.SendMessages] },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ];
      }
      return undefined;
    };

    const roleResults = {
      created: [],
      updated: [],
      skipped: []
    };

    let staffRole;
    let memberRole;
    const createdRoles = [];

    for (const roleSpec of ROLES) {
      const existingBefore = guild.roles.cache.find(r => r.name === roleSpec.name);
      const role = await getOrCreateRole(roleSpec);
      if (!role) {
        roleResults.skipped.push(roleSpec.name);
        continue;
      }
      createdRoles.push(role);
      if (roleSpec.name === 'Moderator') staffRole = role;
      if (roleSpec.name === 'Member') memberRole = role;
      if (existingBefore) {
        roleResults.updated.push(role.name);
      } else {
        roleResults.created.push(role.name);
      }
    }

    if (!memberRole) memberRole = guild.roles.cache.find(r => r.name === 'Users');

    const removedRoles = [];
    for (const name of REMOVED_ROLES) {
      const role = guild.roles.cache.find(r => r.name === name);
      if (!role || !role.editable) continue;
      try {
        await role.delete('Lobster setup: role removed from starter layout');
        removedRoles.push(name);
      } catch (error) {
        console.error(`Could not delete role ${name}:`, error);
      }
    }

    try {
      if (createdRoles.length > 0 && me && me.roles && me.roles.highest) {
        const rolesToReorder = [...createdRoles];
        const order = ROLES.map(r => r.name);
        rolesToReorder.sort((a, b) => {
          const ia = order.indexOf(a.name);
          const ib = order.indexOf(b.name);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        const positions = rolesToReorder.map((r, i) => ({
          role: r.id,
          position: me.roles.highest.position - (rolesToReorder.length - i)
        }));
        await guild.roles.setPositions(positions);
      }
    } catch (error) {
      console.error('Could not reorder roles:', error);
    }

    const created = {};
    for (const spec of LAYOUT) {
      const category = await getOrCreateCategory(spec);
      for (const channelSpec of spec.channels) {
        const type = channelSpec.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        let channel = guild.channels.cache.find(existing =>
          existing.parentId === category.id && existing.name === channelSpec.name
        );
        if (!channel) {
          channel = await guild.channels.create({
            name: channelSpec.name,
            type,
            parent: category.id,
            topic: type === ChannelType.GuildText ? channelSpec.topic : undefined,
            permissionOverwrites: channelOverwrites(spec, channelSpec),
            reason: 'Lobster starter server setup'
          });
        }
        created[channelSpec.key] = channel;
      }
    }

    try {
      const categoryOrder = LAYOUT.map(spec =>
        guild.channels.cache.find(channel =>
          channel.type === ChannelType.GuildCategory && channel.name === spec.name
        )
      ).filter(Boolean);
      await guild.channels.setPositions(categoryOrder.map((channel, index) => ({
        channel: channel.id,
        position: index
      })));
    } catch (error) {
      console.error('Could not reorder the starter categories:', error);
    }

    let ticketCategory = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory && channel.name === '🎫・Support Tickets'
    );
    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: '🎫・Support Tickets',
        type: ChannelType.GuildCategory,
        reason: 'Lobster starter ticket setup'
      });
    }

    const settings = db.getSettings(guild.id);
    db.updateSetting(guild.id, 'welcomeChannel', created.welcome.id);
    db.updateSetting(guild.id, 'welcomer', 1);
    db.updateSetting(guild.id, 'farewellChannel', created.welcome.id);
    db.updateSetting(guild.id, 'farewellEnabled', 1);
    db.updateSetting(guild.id, 'auditLogChannel', created['audit-logs'].id);
    db.updateSetting(guild.id, 'eventLogsEnabled', true);
    db.updateSetting(guild.id, 'eventLogChannels', {
      ...settings.eventLogChannels,
      moderation: created['mod-logs'].id
    });
    db.updateSetting(guild.id, 'counting', 1);
    db.updateSetting(guild.id, 'countingChannel', created.counting.id);
    db.updateSetting(guild.id, 'lastCount', 0);
    db.updateSetting(guild.id, 'lastCounter', null);
    db.updateSetting(guild.id, 'levelUpChannel', created.general.id);
    if (memberRole && memberRole.editable) db.updateSetting(guild.id, 'autorole', memberRole.id);
    db.updateSetting(guild.id, 'ticketChannel', created.support.id);
    db.updateSetting(guild.id, 'ticketCategory', ticketCategory.id);
    db.updateSetting(guild.id, 'ticketAdminRole', staffRole.id);
    db.updateSetting(guild.id, 'ticketTranscriptChannel', created['ticket-logs'].id);

    try {
      if (created['general-voice']) await guild.setAFKChannel(created['afk-voice'] || created['general-voice']);
      if (created.general) await guild.setSystemChannel(created.general);
    } catch (error) {
      console.error('Could not apply the starter server defaults:', error);
    }

    const ticketEmbed = new EmbedBuilder()
      .setColor(settings.ticketColor || 0xff6b35)
      .setAuthor({
        name: `🎫 ${guild.name} · Support`,
        iconURL: guild.iconURL() || undefined
      })
      .setTitle(settings.ticketTitle || '🎫 Support System')
      .setDescription(settings.ticketMessage || 'Click the button below to open a private ticket and our team will help you as soon as possible.')
      .setThumbnail(guild.iconURL({ size: 256 }) || undefined)
      .setFooter({ text: '🦞 Lobster · Support' })
      .setTimestamp();
    if (settings.ticketImage) ticketEmbed.setImage(settings.ticketImage);
    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel(settings.ticketButtonLabel || '📩 Open a ticket')
        .setStyle(ButtonStyle.Primary)
    );
    const previousPanelChannel = guild.channels.cache.get(settings.ticketChannel);
    let existingPanel;
    if (settings.ticketPanelMessageId && previousPanelChannel?.messages) {
      existingPanel = await previousPanelChannel.messages.fetch(settings.ticketPanelMessageId).catch(error => {
        if (error.code !== 10008) throw error;
        return null;
      });
    }
    let ticketPanel;
    if (existingPanel && previousPanelChannel.id === created.support.id) {
      ticketPanel = await existingPanel.edit(stylePayload(module.exports, {
        embeds: [ticketEmbed],
        components: [panelRow]
      }, { guild, client: guild.client }));
    } else {
      ticketPanel = await created.support.send(stylePayload(module.exports, {
        embeds: [ticketEmbed],
        components: [panelRow]
      }, { guild, client: guild.client }));
      if (existingPanel) {
        await existingPanel.delete().catch(error => {
          console.error('Could not remove the previous ticket panel during setup:', error);
        });
      }
    }
    db.updateSetting(guild.id, 'ticketPanelMessageId', ticketPanel.id);

    const embed = new EmbedBuilder()
      .setColor(0xff6b35)
      .setAuthor({ name: `${guild.name} · Server setup`, iconURL: guild.iconURL() || undefined })
      .setTitle('🦞 Your server layout is ready')
      .setDescription(
        'Lobster created a clean, organised layout. Private staff areas are locked to the **Moderator** role, and public channels are ready for your community.'
      )
      .addFields(
        {
          name: '🛡️ Private (staff only)',
          value: [created['mod-logs'], created['audit-logs'], created['ticket-logs'], created['staff-announcements'], created['staff-chat'], created['staff-voice']].map(c => `${c}`).join(' · ')
        },
        {
          name: '📌 Information',
          value: [created.rules, created.announcements, created.welcome, created.commands].map(c => `${c}`).join(' · ')
        },
        {
          name: '💬 Community',
          value: [created.general, created.media, created.memes, created.memories, created.counting, created.support].map(c => `${c}`).join(' · ')
        },
        {
          name: '🔊 Voice',
          value: [created['general-voice'], created['gaming-voice'], created['music-voice'], created['afk-voice']].map(c => `${c}`).join(' · ')
        },
        {
          name: '⚙️ Configured for you',
          value: [
            `👋 Welcome & farewell cards in ${created.welcome}`,
            `📋 Logs in ${created['audit-logs']} · moderation in ${created['mod-logs']}`,
            `🎫 Ticket panel in ${created.support} · transcripts in ${created['ticket-logs']}`,
            `🔢 Counting started in ${created.counting}`,
            (memberRole && memberRole.editable) ? `🎭 New members get ${memberRole}` : '🎭 Autorole skipped (role not editable)'
          ].join('\n')
        },
        {
          name: '🚀 Next steps',
          value: '`/welcomer` · design the welcome card\n`/ticket-panel` · customise support\n`/log` · adjust what gets logged\n`/help` · browse every command'
        },
        {
          name: '🎭 Roles',
          value: `Created: ${roleResults.created.length ? roleResults.created.join(', ') : 'none'}\nUpdated: ${roleResults.updated.length ? roleResults.updated.join(', ') : 'none'}\nSkipped: ${roleResults.skipped.length ? roleResults.skipped.join(', ') : 'none'}\nRemoved: ${removedRoles.length ? removedRoles.join(', ') : 'none'}`
        }
      )
      .setFooter({ text: '🦞 Lobster · Starter layout' })
      .setTimestamp();
    return isSlash
      ? interaction.editReply({ embeds: [embed] })
      : progressMessage.edit({ embeds: [embed], content: '' });
  }
};