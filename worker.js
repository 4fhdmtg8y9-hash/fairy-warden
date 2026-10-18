
const GUILD_ID = "1542010384091971614";

const ALLOWED_ROLES = new Set([
  "1542072789958131732",
  "1542018762285252690",
  "1561102957007601856",
  "1561144901373268039",
  "1561145345533157426",
  "1561145428517593129"
]);

function reply(body, status = 200) {
  return Response.json(body, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/verify") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "GET") {
      return reply({ error: "Method not allowed" }, 405);
    }

    if (!env.DISCORD_BOT_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return reply({ error: "Server configuration is incomplete" }, 500);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return reply({ error: "Not logged in" }, 401);
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
        return reply({ error: "Supabase login validation failed" }, 401);
      }

      const user = await authResponse.json();

      const identity = user.identities?.find(
        item => item.provider === "discord"
      );

      const candidates = [
        identity?.identity_data?.sub,
        identity?.identity_data?.provider_id,
        identity?.identity_data?.user_id,
        user.user_metadata?.provider_id,
        user.user_metadata?.sub
      ];

      const discordId = candidates.find(
        value => typeof value === "string" && /^\d{17,20}$/.test(value)
      );

      if (!discordId) {
        return reply({
          error: "Could not find your Discord account ID. Please sign out and log in again."
        }, 403);
      }

      const discordResponse = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
        {
          headers: {
            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
          }
        }
      );

      if (discordResponse.status === 404) {
        return reply({
          error: "Your Discord account was not found in Fairy Academy. Check that you joined the server and that the account is correct."
        }, 403);
      }

      if (!discordResponse.ok) {
        return reply({
          error: "Discord member lookup failed. Check the bot token and server access."
        }, 502);
      }

      const member = await discordResponse.json();

      if (!Array.isArray(member.roles)) {
        return reply({ error: "Discord returned an invalid member record" }, 502);
      }

      const hasStaffRole = member.roles.some(role =>
        ALLOWED_ROLES.has(role)
      );

      if (!hasStaffRole) {
        return reply({
          error: "Your account was found, but none of the six approved staff roles matched."
        }, 403);
      }

      return reply({ allowed: true });
    } catch {
      return reply({ error: "Verification service failed unexpectedly" }, 500);
    }
  }
};
