# Lobster

A Discord.js v14 bot for server setup, moderation, welcome cards, private tickets, giveaways, utilities, and chat levels.

## Run Lobster

1. Install Node.js 18.17 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in `TOKEN`, `CLIENT_ID`, and `OWNER_ID`.
4. In the Discord Developer Portal, enable **Server Members Intent** and **Message Content Intent** for the bot.
5. Invite the bot with the `bot` and `applications.commands` scopes. Grant the permissions it needs, including Manage Channels, Manage Roles, Manage Messages, Moderate Members, Ban Members, Kick Members, Send Messages, Embed Links, Read Message History, and Connect.
6. Run `node deploy-commands.js` once, then start the bot with `node index.js`.

Use `npm run deploy` and `npm start` for the same commands. Guild settings, welcome-card design, ticket-panel configuration, levels, giveaways, and AFK statuses are stored in `data/database.json`.

## Web dashboard

The static dashboard pages are in the sibling `~/Site` folder. Host that folder over HTTPS and run the Lobster bot with the dashboard environment variables from `.env.example`. In the Discord Developer Portal, add `DASHBOARD_REDIRECT_URI` as an OAuth2 redirect URL and create an OAuth2 client secret. The bot application ID is used as `CLIENT_ID`; never put the OAuth client secret or bot token in the static site.

Set `DASHBOARD_ORIGIN` to the exact HTTPS origin serving `~/Site` (no trailing slash), `DASHBOARD_REDIRECT_URI` to `https://your-bot-api.example/api/auth/callback`, `DASHBOARD_RETURN_URL` to the full HTTPS URL of the hosted `/dashboard` route, and `DASHBOARD_PORT` to the API port. For GitHub Pages project sites, the dashboard return URL includes the project path (for example, `https://lobsterv7869.github.io/Site/dashboard.html`), but `DASHBOARD_ORIGIN` remains `https://lobsterv7869.github.io`. Set `window.LOBSTER_API_BASE` in `~/Site/dashboard-config.js` to the bot API origin (for example, `https://your-bot-api.example`). The Vercel deployment supports clean routes such as `/`, `/dashboard`, `/settings`, `/privacy`, and `/terms`. The dashboard sends ngrok's browser-warning bypass header on API requests when using a free ngrok tunnel. Configure your HTTPS reverse proxy to forward that port and preserve the `Host` and `X-Forwarded-Proto` headers; firewall the API port so it is reachable only through the proxy. Set `DASHBOARD_TRUST_PROXY=true` only when that trusted proxy clears client-supplied forwarding headers. Generate a unique random `DASHBOARD_SESSION_SECRET` of at least 32 characters. Sign-in uses a one-time OAuth handoff and a tab-scoped dashboard session; Discord OAuth tokens remain on the bot host. Dashboard sessions are held in memory and users need to sign in again after a bot restart. Users must have **Manage Server** in a server where Lobster is installed. Role editing also requires **Manage Roles** and respects both the user's and Lobster's role hierarchy.

The dashboard currently manages existing Lobster settings: prefix and role assignment, welcome/farewell cards, AutoMod, event logs, levels, join security, counting, automatic replies, Discord role names/colors, and Discord-native button verification. Verification assigns an unverified role to new members, then swaps it for the verified role after they press the panel button; it is not identity or external-account verification. Configure restricted channel permissions for unverified members in Discord. Verification requires Manage Roles and a bot role above the configured roles. The dashboard can publish or update the verification panel and send a test log. Hangar RP whitelist and alliance/ban-sharing integrations are not implemented because Lobster has no Hangar API integration.

The optional join-rate guard kicks additional eligible joiners after a configurable server-wide threshold and emits at most one security-channel alert per window; the in-memory counter resets when the bot restarts. This can affect legitimate member surges, so it is off by default. Anti-nuke is also off by default and reacts only to the audit-log events it watches; neither feature can undo damage already done or guarantee protection from raids. Lobster does not identify which invite a member used. Discord OAuth redirect, API origin, and OAuth client secret must be configured before the dashboard can accept sign-ins.

For static hosts that support a `_headers` file (such as Cloudflare Pages or Netlify), `~/Site/_headers` applies clickjacking and browser security headers. GitHub Pages does not apply this file; for GitHub Pages, serve the dashboard through a proxy/CDN that sets the headers described there. The dashboard also refuses to run when embedded as a best-effort fallback.

Prefix commands use concise text replies; slash-command embeds keep Lobster's orange `#FF6B35` styling. `/userinfo`, `/serverinfo`, and `/roleinfo` show expanded member, server, and role profiles.

## First server setup

Run `/setup` as a server administrator. It creates a starter role and channel layout, turns on welcome and farewell cards in `#welcome`, assigns the Member role to new arrivals when the bot's role order allows it, configures staff-only event logs in `#logs`, and creates a private-ticket panel in `#support`. Run `/help` or `p help` to browse commands.

Every slash command also has a prefix form. The default prefix for new server settings is `p`; server administrators can view or change it with `/prefix` or `p prefix new`. Existing servers keep their saved prefix.

Every command reply is a plain text message — Lobster never replies with embeds. Prefix commands use `p command [arguments]`. Examples: `p kick @member [reason]`, `p ban @member [reason]`, and `p mute @member <minutes> [reason]`. If a target is missing, Lobster gives a short prompt such as "Please mention a user to kick."

### Automatic server backups

Backups are **off by default** because they retain message content. A server administrator can enable them with `/backup enable`; Lobster immediately creates a snapshot and then refreshes it every three days. `/backup create` also makes a one-off snapshot even while automatic backups are off. Each successful snapshot includes current role and channel settings and every accessible message created since the previous successful snapshot (the first one covers the preceding three days), including active threads. A safety limit of 10,000 messages applies per snapshot; if exceeded, or if Lobster cannot read a channel's history, that snapshot fails and the existing backup is kept.

Only the newest successful compressed JSON backup is retained on the bot host. `/backup status` shows its age and counts, `/backup export` downloads it, and `/backup disable` stops future automatic snapshots but preserves the latest file. A saved snapshot stays on the host until another successful snapshot replaces it or the operator deletes it. Message text and metadata are included; attachment files are not copied, and attachment URLs can expire. These snapshots are archives, not one-click restoration: Discord does not allow Lobster to recreate old messages as if they were written by their original authors. Grant Lobster **View Channel** and **Read Message History** in every channel to include it. See `~/Site/privacy-policy.html` for retention details.

## Server tools

- **Welcome and farewell:** `/welcomer` configures separate join and departure cards, with previewable welcome templates. Supports `{user}`, `{username}`, `{server}`, `{membercount}`, `{created}`, `{joined}`, and `{id}`. Bot-generated embeds consistently use Lobster orange.
- **Automatic moderation:** `/automod enabled:true` turns on the configured filters. Each filter and the blocked-word list can be changed individually. The bot does not silently enable profanity filters with a guessed language-specific word list.
- **Security:** `/security` configures minimum account age, bot blocking, and optional anti-nuke action limits. Anti-nuke is off by default and kicks the responsible non-exempt member when its explicitly configured threshold is reached. Give Lobster **Kick Members** and **View Audit Log** permissions before enabling it.
- **Event logs:** `/log channel:#logs` (or `p log #logs`) enables categorized, privacy-conscious server logs. Set an individual destination with `/log category:moderation category_channel:#mod-log` or `p log moderation #mod-log`; disable a category with `/log category:messages category_enabled:false` or `p log messages off`. Use `p log` to see each category and its channel. Event logs do not copy message contents; message backups are a separate opt-in. `/auditlog` remains available as a simple single-channel setting.
- **Auto-replies:** `/autoresponse add` saves a case-insensitive phrase and response; `/autoresponse remove` and `/autoresponse list` manage the server's rules.
- **Reaction roles:** Post an announcement or a custom embed, then use `/reactionrole add` with its channel, message ID, emoji, and role. Members gain or lose that role by adding or removing the reaction.
- **Embeds:** `/embed` sends a custom announcement embed. Use `/help` for the current prefix equivalents and arguments.
- **Ship cards:** `/ship` or `p ship` makes a playful compatibility card for two server members. Mention one member to pair them with yourself or mention two to compare those members; with no targets Lobster picks a cached server member if one is available. The card includes a random score and “Ship again” and owner-only “Delete” buttons. ImageMagick must be installed on the bot host to render the PNG card (for example, `sudo apt install imagemagick` on Debian/Ubuntu).

Prefix examples for configuration:

```text
l automod on --spam-limit 6 --spam-window 8 --words "scam,phishing"
l security --min-age 7 --block-bots on --anti-nuke on --limit 4 --window 10
p log #logs
p log moderation #mod-log
p log messages #message-log
l autoresponse add "server ip" "Join with play.example.net"
l welcomer #welcome --farewell-channel #welcome --farewell-enabled on --farewell-message "{username} has left {server}."
```

## Welcome cards

Use `/welcomer` to configure the card, then choose a channel to enable it. Available fields include title, message, banner image, thumbnail, and an optional game/server address. `/welcomer preview:true` previews the card. Set `reset:true` to restore the card design defaults.

Message and footer placeholders:

- `{user}` — member mention
- `{username}` — member username
- `{server}` — server name
- `{membercount}` — current member count
- `{created}` — relative account creation date
- `{joined}` — relative server join date
- `{id}` — member ID

Example prefix configuration:

```text
l welcomer #welcome --title "Welcome aboard!" --message "Welcome {user} to {server}!" --image https://example.com/banner.png
l welcomer --preview
```

## Private ticket panels

Run `/ticket-panel staff_role:@Support` to create a panel, or edit the panel created by `/setup`. Customize its channel, category, heading, description, button label, image, color, and the message shown in new tickets. Set `transcript_channel` to a private staff channel to save a text transcript when a ticket closes; set `transcript_enabled:false` to disable transcripts. `/setup` creates a private `#ticket-transcripts` channel automatically. The panel is updated in place when it remains in the same channel; members can have one open ticket at a time, and only its creator or staff can close it.

Prefix example:

```text
l ticket-panel #support @Moderator --title "Support desk" --message "Choose below to open a private ticket." --button "Open a ticket" --image https://example.com/support.png --transcript-channel #ticket-transcripts
```

## Chat levels

Chat levels are enabled by default. A member earns a small random amount of XP at most once per minute. Use `/level [member]` to see a rank and progress, `/leaderboard` for the top ten, or `/levels` to toggle XP and choose an announcement channel. Level data is kept separately for each server.

## Voice joiner

The dashboard's **Voice joiner** connects the official Lobster **bot account** to a voice channel using Discord's supported bot gateway (the `@discordjs/voice` `joinVoiceChannel` helper). Enter a **Server ID** and **Voice Channel ID** (or pick a visible channel to fill the ID), then use **Connect** and **Disconnect**. The Server ID must match a server where Lobster is installed and where you have **Manage Server**.

A join is only reported as successful after the voice connection reaches the `ready` state. If it cannot be confirmed within 15 seconds the bot destroys the connection, clears the saved channel, and returns an error — the dashboard never claims an account has joined unless the connection is confirmed. Lobster needs **View Channel**, **Connect**, and **Speak** in the target channel; a user limit that Lobster cannot fit into, a missing invite, or missing channel permissions all surface as errors. Auto-reconnect (off unless enabled) remembers the saved channel and rejoins it after a drop or bot restart, but it still requires the same permissions and cannot recover from being removed from the server.

### Why the self-bot reference is not integrated

Tools such as `efekrbas/discord-voice-joiner` are **not compatible with Discord's official APIs** and are deliberately not integrated. That project is a self-bot: it reads raw **user account tokens** from `tokens.txt` and connects to the user gateway (`wss://gateway.discord.gg`), sending OP 2 `IDENTIFY` with spoofed client properties and OP 4 voice-state updates. Automating a user account this way violates Discord's Terms of Service and can result in permanent account termination; it also requires storing a credential equivalent to a password and evades client-fingerprint detection. Discord provides no official API for a user account to join voice, so this cannot be done safely or with support.

## Giveaways

Start a giveaway with `/giveaway`, or use either prefix order: `p giveaway 10m Nitro` or `p giveaway Nitro 10m`. Prefix durations accept minutes (`m`), hours (`h`), or days (`d`); the winner count defaults to one. To choose multiple winners, use `p giveaway 10m 2 Nitro` or `p giveaway Nitro 10m 2`.

## Privacy

Lobster does not save chat message contents by default. Administrators who explicitly enable `/backup` opt in to a compressed local snapshot of message content and metadata, refreshed every three days and replaced only after a successful new snapshot. Its local `data/database.json` stores per-server settings, backup opt-in, AFK reasons, giveaway entries, configured auto-replies/reaction roles, and member IDs with their chat XP so those features keep working after a restart. Automod uses short-lived in-memory message hashes and timestamps to check duplicates and flood limits; it does not persist them. The bot owner should protect the data directory and `.env` file. Removing the bot does not erase the bot host's local files; delete `data/database.json` and `data/backups/` to erase local records and snapshots.

## Required bot setup

Keep the bot's highest role above the Member role and any roles it must assign. Some features also need their individual Discord permissions in the channel where they are used. The bot does not need Administrator permission.
