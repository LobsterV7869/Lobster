# Lobster Canvas Cards

Reusable canvas rendering system for Discord.js v14 slash commands using `@napi-rs/canvas`.

## Structure

- `theme.js` — design tokens (colors, fonts, sizes, spacing)
- `fonts.js` — registers Inter fonts (Regular/SemiBold/Bold) with fallback
- `helpers.js` — drawing utilities (roundRect, fitText, avatars, icons, formatting)
- `cards/` — card renderers
  - `infoCard.js`
  - `profileCard.js`
  - `leaderboardCard.js`
  - `resultCard.js`
  - `listCard.js`
  - `eventCard.js`
  - `welcomeCard.js`
- `index.js` — `renderCard(type, data)` and `registerCard(type, module)`
- `send.js` — `replyWithCard(context, type, data, opts?)`

## Usage

```js
const { replyWithCard } = require('../canvas/send');

await replyWithCard(interaction, 'leaderboard', {
  title: 'Leaderboard',
  entries: [{ rank: 1, avatarUrl, name, value, userId }],
  highlightUserId: interaction.user.id,
  page: 1,
  totalPages: 1,
});
```

`replyWithCard` defers, renders, replies with a PNG attachment, and falls back to a simple embed on error.

## Add a New Card Type

1. Create `canvas/cards/myCard.js` exporting `async function render(data)` that returns a PNG `Buffer`.
2. Use `createCanvas` from `@napi-rs/canvas`, `drawBase/cardBounds` from helpers, and theme tokens.
3. Register it:
   - Add to `canvas/index.js` cards map, **or**
   - Call `registerCard('mytype', require('./cards/myCard'))` at startup.
4. Call `replyWithCard(interaction, 'mytype', data)`.

## Notes

- Renders at 2x internally and exports at 1200px width for crisp text.
- Avatars are cached in memory for 5 minutes; failed loads fall back to an initial-letter avatar.
- No emojis in canvas text; vector icons are used instead.
- Inter fonts are auto-registered when available; falls back to sans-serif safely.
