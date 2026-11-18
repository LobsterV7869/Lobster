const fs = require('node:fs');
const path = require('node:path');
const { renderCard } = require('../canvas');

function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(24) };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const cases = [
    ['info', {
      title: 'Server Information',
      subtitle: 'Lobster Bot • Community Hub',
      iconType: 'server',
      stats: [
        { label: 'Members', value: '12.4K' },
        { label: 'Online', value: '3,201' },
        { label: 'Channels', value: '42' },
        { label: 'Roles', value: '18' },
        { label: 'Boosts', value: '14' },
        { label: 'Region', value: 'Automatic' },
        { label: 'Owner', value: 'VeryLongUsernameThatShouldFit' },
        { label: 'Created', value: '07 Nov 2026' },
      ],
      footer: '07 Nov 2026 · 13:02',
    }],
    ['profile', {
      avatarUrl: null,
      username: 'LobsterUserWithAVeryLongNameToTestFitting',
      tag: '@lobster',
      badges: ['Member', 'Booster', 'Active'],
      level: 12,
      xp: 3450,
      xpNeeded: 5000,
      rank: 7,
      stats: [
        { label: 'Messages', value: '1.2K' },
        { label: 'Voice', value: '45h' },
        { label: 'Streak', value: '9d' },
      ],
    }],
    ['leaderboard', {
      title: 'Server Leaderboard',
      entries: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        avatarUrl: null,
        name: i === 0 ? 'Champion With A Really Long Display Name' : `User ${i + 1}`,
        value: (10 - i) * 1250,
        userId: i === 3 ? 'highlight-me' : `u${i}`,
      })),
      highlightUserId: 'highlight-me',
      page: 1,
      totalPages: 3,
    }],
    ['result', {
      type: 'success',
      title: 'Action Completed',
      description: 'The requested moderation action was applied successfully. This description is intentionally a bit longer to verify wrapping and truncation behavior.',
      fields: [
        { label: 'Moderator', value: 'Omar#0001' },
        { label: 'Target', value: 'BadUser#1234' },
        { label: 'Case', value: '#1024' },
        { label: 'Duration', value: 'Permanent' },
      ],
    }],
    ['list', {
      title: 'Available Commands',
      iconType: 'info',
      items: Array.from({ length: 12 }, (_, i) => ({
        name: `/command-${i + 1}`,
        description: `Description for command ${i + 1} that is long enough to be truncated to a single readable line in the list card.`,
      })),
      page: 1,
      totalPages: 2,
    }],
    ['event', {
      title: 'Nitro Giveaway Event With Long Title',
      status: 'ACTIVE',
      hostName: 'LobsterMod',
      id: 'abcd1234efgh5678',
      startedAt: Date.now() - 7200000,
      endedAt: Date.now() + 3600000,
      durationText: '3h',
      winners: [],
      entries: 1284,
      serverName: 'Lobster Community Server',
    }],
    ['welcome', {
      avatarUrl: null,
      username: 'NewMember',
      serverName: 'Lobster Community',
      memberCount: 12456,
      type: 'join',
    }],
  ];

  let ok = 0;
  for (const [type, data] of cases) {
    try {
      const buf = await renderCard(type, data);
      const fp = path.join(outDir, `${type}.png`);
      fs.writeFileSync(fp, buf);
      const dim = pngSize(buf);
      console.log(`OK ${type}: ${buf.length} bytes${dim ? ` (${dim.width}x${dim.height})` : ''} -> ${fp}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${type}:`, e && e.stack ? e.stack : e);
      process.exitCode = 1;
    }
  }
  console.log(`Rendered ${ok}/${cases.length} cards.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
