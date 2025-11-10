import type { FastifyInstance } from "fastify";
import { adapter, TeamsBot } from "../services/teams.js";
import { getTokenByTeamsUser, decrypt, upsertToken } from "../services/db.js";
import { refreshTokens, getAccessibleResources } from "../services/auth.js";

const bot = new TeamsBot();

export default async function messagesRoutes(app: FastifyInstance) {
  app.get("/messages", async () => ({
    ok: true,
    hint: "POST aqui (Teams) — Bot Framework ativo.",
  }));

  app.post("/messages", async (req, reply) => {
    const rawReq: any = req.raw;
    const rawRes: any = reply.raw;

    let teamsUserId: string | null = null;
    try {
      const body = (req.body as any) || {};
      teamsUserId = body?.from?.id || null;
    } catch {}

    let authCtx: { accessToken?: string; cloudId?: string } = {};
    if (teamsUserId) {
      const row = await getTokenByTeamsUser(teamsUserId);
      if (row) {
        const refresh = decrypt(row.refresh_token_enc, row.iv, row.tag);
        const refreshed = await refreshTokens(refresh);
        if (refreshed.refresh_token) {
          await upsertToken({
            teamsUserId,
            atlassianAccountId: row.atlassian_account_id,
            cloudId: row.cloud_id,
            refreshToken: refreshed.refresh_token,
          });
        }
        const resources = await getAccessibleResources(refreshed.access_token);
        const jira =
          resources.find(
            (r) => r.id && (r.url || "").includes(".atlassian.net")
          ) || resources[0];
        authCtx = { accessToken: refreshed.access_token, cloudId: jira.id };
      }
    }

    await adapter.process(rawReq, rawRes, async (context) => {
      context.turnState.set("auth", authCtx);
      await bot.run(context);
    });

    reply.sent = true;
  });
}
