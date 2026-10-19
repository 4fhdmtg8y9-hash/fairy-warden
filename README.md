# Fairy Warden

## One-time setup

### Supabase

1. Open the project SQL Editor.
2. Run `supabase/schema.sql` once. This creates the staff directory, moderation history, schedules, announcement history, and points leaderboard.
3. Keep the existing Discord OAuth provider enabled.

### Cloudflare Worker

Set these Worker **secrets**:

- `DISCORD_BOT_TOKEN` — the bot token.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key. This must stay server-side.

Set these Worker **variables**:

- `SUPABASE_URL`
- `SUPABASE_KEY` — the existing Supabase publishable key used to verify signed-in users.
- `DISCORD_PUBLIC_KEY`
- `MODERATION_REVIEW_CHANNEL_ID`
- `INACTIVITY_REVIEW_CHANNEL_ID`
- `ANNOUNCEMENT_CHANNEL_ID`
- `APPROVER_ROLE_IDS` — comma-separated Discord role IDs for the Owner, Community Manager/Supervisor, and Director. These roles alone can approve/deny Discord reports and publish announcements.

The six accepted staff role IDs are currently listed in `STAFF_ROLES` in `worker.js`. Replace those IDs with the Fairy Academy staff roles if they differ.

### Discord bot

In the Discord Developer Portal:

- Enable **Server Members Intent** for staff verification and the directory.
- Enable **Presence Intent** for the live staff-online widget.
- Set the Interactions Endpoint URL to `https://fairy-warden.4fhdmtg8y9.workers.dev/api/discord/interactions`.

Give the bot View Channel, Send Messages, Embed Links, Attach Files, and Read Message History in the moderation, inactivity, and announcement channels. Keep the bot token in a Worker secret; reports are sent through the bot API, so no webhook URL is needed.

The live presence widget uses a Cloudflare Durable Object configured in `wrangler.toml`. Deploy with a Wrangler version that supports SQLite-backed Durable Objects.

## Run and deploy

Run `npm install` once. Use `npm run dev` for local development and `npm run deploy` to publish. After setting Cloudflare secrets and variables and running the SQL schema, the dashboard provides:

- Private moderation history for each submitting moderator; approved reports earn 5 points.
- A points leaderboard, staff directory with Discord profiles and first/last dashboard login, and a shared staff schedule.
- Announcements published to Discord, restricted to configured approver roles.
- Moderation and inactivity approval buttons restricted to those same roles.
- A live Discord staff presence widget (requires Presence Intent).
