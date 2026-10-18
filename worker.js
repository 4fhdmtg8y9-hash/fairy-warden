
const GUILD_ID = "1542010384091971614";

const ALLOWED_ROLES = new Set([
  "1542072789958131732",
  "1542018762285252690",
  "1561102957007601856",
  "1561144901373268039",
  "1561145345533157426",
  "1561145428517593129"
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/verify") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.DISCORD_BOT_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return json({ error: "Worker environment variables are missing" }, 500);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Not logged in" }, 401);
    }

    try {
      const authResponse = await fetch(
        `${env.SUPABASE_URL}/auth/v1/user`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: authorization
          }
        }
      );

      if (!authResponse.ok) {
        return json({ error: "Supabase rejected the login token" }, 401);
      }

      const user = await authResponse.json();
      const identity = user.identities?.find(
        item => item.provider === "discord"
      );

      const discordId = [
        identity?.identity_data?.sub,
        identity?.identity_data?.provider_id,
        identity?.identity_data?.user_id,
        identity?.id,
        user.user_metadata?.provider_id,
        user.user_metadata?.sub
      ].find(value =>
        typeof value === "string" && /^\d{17,20}$/.test(value)
      );

      if (!discordId) {
        return json({ error: "Discord account ID was not found; sign in again" }, 403);
      }

      const memberResponse = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
        {
          headers: {
            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
          }
        }
      );

      if (!memberResponse.ok) {
        return json({
          error: memberResponse.status === 404
            ? "Discord account is not a member of Fairy Academy"
            : `Discord API returned HTTP ${memberResponse.status}`
        }, memberResponse.status === 404 ? 403 : 502);
      }

      const member = await memberResponse.json();

      if (!member.roles?.some(role => ALLOWED_ROLES.has(role))) {
        return json({ error: "No approved staff role found" }, 403);
      }

      return json({ allowed: true });
    } catch {
      return json({ error: "Server verification failed" }, 500);
    }
  }
};
