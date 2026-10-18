
const GUILD_ID = "1542010384091971614";

const ALLOWED_ROLES = new Set([
  "1542072789958131732", // Owner
  "1542018762285252690", // Community Manager
  "1561102957007601856", // Director
  "1561144901373268039", // Administrator
  "1561145345533157426", // Senior Moderator
  "1561145428517593129"  // Moderator
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/verify") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405
      });
    }

    try {
      const auth = request.headers.get("Authorization");

      if (!auth?.startsWith("Bearer ")) {
        return Response.json({ error: "Not logged in" }, {
          status: 401
        });
      }

      const userResponse = await fetch(
        `${env.SUPABASE_URL}/auth/v1/user`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: auth
          }
        }
      );

      if (!userResponse.ok) {
        return Response.json({ error: "Invalid login" }, {
          status: 401
        });
      }

      const user = await userResponse.json();

      const discordIdentity = user.identities?.find(
        identity => identity.provider === "discord"
      );

      const discordId =
        discordIdentity?.identity_data?.sub ||
        discordIdentity?.identity_data?.provider_id ||
        discordIdentity?.id;

      if (!discordId) {
        return Response.json({ error: "Discord identity not found" }, {
          status: 403
        });
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
        return Response.json({ error: "Not a server member" }, {
          status: 403
        });
      }

      const member = await memberResponse.json();
      const allowed = member.roles.some(role =>
        ALLOWED_ROLES.has(role)
      );

      if (!allowed) {
        return Response.json({ error: "Staff access denied" }, {
          status: 403
        });
      }

      return Response.json({
        allowed: true,
        discordId
      });
    } catch {
      return Response.json({ error: "Verification failed" }, {
        status: 500
      });
    }
  }
};
