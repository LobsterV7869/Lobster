const LOG_TYPES = [
  {
    key: 'ban',
    label: 'Bans',
    emoji: '🔨',
    section: 'moderation',
    description: 'Bans, unbans, and temporary ban changes.',
    color: 0xed4245,
    defaultEnabled: true
  },
  {
    key: 'kick',
    label: 'Kicks',
    emoji: '👢',
    section: 'moderation',
    description: 'Members kicked from the server.',
    color: 0xe67e22,
    defaultEnabled: true
  },
  {
    key: 'timeout',
    label: 'Timeouts',
    emoji: '⏱️',
    section: 'moderation',
    description: 'Communication timeouts added, changed, or removed.',
    color: 0xf1c40f,
    defaultEnabled: true
  },
  {
    key: 'mod',
    label: 'Moderation actions',
    emoji: '🛡️',
    section: 'moderation',
    description: 'Warnings, purges, softbans, and other moderator actions.',
    color: 0xe67e22,
    defaultEnabled: true
  },
  {
    key: 'protection',
    label: 'Protection',
    emoji: '🚨',
    section: 'moderation',
    description: 'AutoMod, anti-nuke, webhook, and server protection events.',
    color: 0xe74c3c,
    defaultEnabled: true
  },
  {
    key: 'role',
    label: 'Roles',
    emoji: '🎭',
    section: 'general',
    description: 'Role creation, deletion, updates, and member role changes.',
    color: 0x5865f2,
    defaultEnabled: true
  },
  {
    key: 'reaction',
    label: 'Reactions',
    emoji: '💠',
    section: 'general',
    description: 'Reactions added to and removed from messages.',
    color: 0xeb459e,
    defaultEnabled: false
  },
  {
    key: 'emoji',
    label: 'Emoji & stickers',
    emoji: '😄',
    section: 'general',
    description: 'Custom emoji and sticker changes.',
    color: 0xfee75c,
    defaultEnabled: true
  },
  {
    key: 'ticket',
    label: 'Tickets',
    emoji: '🎫',
    section: 'general',
    description: 'Tickets opened, closed, and managed.',
    color: 0x57f287,
    defaultEnabled: true
  },
  {
    key: 'message',
    label: 'Messages',
    emoji: '💬',
    section: 'general',
    description: 'Message edits, deletions, and bulk deletions.',
    color: 0x3498db,
    defaultEnabled: true
  },
  {
    key: 'level',
    label: 'Levels',
    emoji: '📈',
    section: 'general',
    description: 'Members reaching a new level.',
    color: 0x57f287,
    defaultEnabled: true
  },
  {
    key: 'name',
    label: 'Names',
    emoji: '🏷️',
    section: 'general',
    description: 'Nickname, username, and display name changes.',
    color: 0x9b59b6,
    defaultEnabled: true
  },
  {
    key: 'voice',
    label: 'Voice',
    emoji: '🔊',
    section: 'general',
    description: 'Voice channel joins, leaves, moves, mutes, and deafens.',
    color: 0x1abc9c,
    defaultEnabled: true
  },
  {
    key: 'channel',
    label: 'Channels',
    emoji: '📚',
    section: 'general',
    description: 'Channel and thread creation, deletion, and updates.',
    color: 0x3498db,
    defaultEnabled: true
  },
  {
    key: 'invite',
    label: 'Invites',
    emoji: '🔗',
    section: 'general',
    description: 'Invite creation and deletion, plus the invite used when a member joins.',
    color: 0x2ecc71,
    defaultEnabled: true
  },
  {
    key: 'joinleave',
    label: 'Join & leave',
    emoji: '👋',
    section: 'general',
    description: 'Members joining and leaving the server.',
    color: 0x57f287,
    defaultEnabled: true
  }
];

const TYPE_MAP = Object.fromEntries(LOG_TYPES.map(type => [type.key, type]));
const MODERATION_TYPES = LOG_TYPES.filter(type => type.section === 'moderation');
const GENERAL_TYPES = LOG_TYPES.filter(type => type.section === 'general');
const ROOT_CATEGORY_NAME = 'Lobster Logs';
const PANEL_THUMBNAIL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f5d2.png';
const PANEL_COLOR = 0x1f3a5f;
const SILVER_COLOR = 0xc0c0c0;

function channelName(key) {
  return `${key}-log`;
}

module.exports = {
  LOG_TYPES,
  TYPE_MAP,
  MODERATION_TYPES,
  GENERAL_TYPES,
  ROOT_CATEGORY_NAME,
  PANEL_THUMBNAIL,
  PANEL_COLOR,
  SILVER_COLOR,
  channelName
};
