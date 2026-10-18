# Fairy Warden

## Discord review queue setup

The site verifies staff through Supabase and the Cloudflare Worker. Before deploying the new moderation and inactivity flows, configure these Worker secrets/variables in Cloudflare:

- `DISCORD_BOT_TOKEN` — existing bot token.
- `SUPABASE_URL` and `SUPABASE_KEY` — existing Supabase values.
- `MODERATION_REVIEW_CHANNEL_ID` — Discord channel where moderation reports should be posted.
- `INACTIVITY_REVIEW_CHANNEL_ID` — Discord channel where inactivity requests should be posted.
- `APPROVER_ROLE_IDS` — comma-separated role IDs for **Owner**, **Community Supervisor**, and **Director** only.
- `DISCORD_PUBLIC_KEY` — the Discord application public key, required for secure approve/deny buttons.

In the Discord Developer Portal, set the app's Interactions Endpoint URL to:

`https://fairy-warden.4fhdmtg8y9.workers.dev/api/discord/interactions`

The bot needs permission to send messages, attach files, and use buttons in both review channels.
