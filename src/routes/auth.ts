import type { FastifyInstance } from "fastify";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
} from "../services/auth.js";
import {
  saveCodeVerifier,
  getCodeVerifier,
  upsertToken,
} from "../services/db.js";

function genVerifier() {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

export default async function authRoutes(app: FastifyInstance) {
  app.get("/start", async (req, reply) => {
    const teamsUserId = (req.query as any)?.teamsUserId || "";
    if (!teamsUserId)
      return reply
        .status(400)
        .send({ ok: false, error: "teamsUserId requerido" });

    const codeVerifier = genVerifier();
    await saveCodeVerifier(teamsUserId, codeVerifier);
    const authUrl = buildAuthUrl(teamsUserId, codeVerifier);
    reply.redirect(authUrl);
  });

  app.get("/callback", async (req, reply) => {
    const code = (req.query as any)?.code || "";
    const state = (req.query as any)?.state || "";
    if (!code || !state) return reply.status(400).send("Faltando code/state");

    const codeVerifier = await getCodeVerifier(state);
    if (!codeVerifier) return reply.status(400).send("state inválido");

    const tok = await exchangeCodeForTokens(code, codeVerifier);
    const resources = await getAccessibleResources(tok.access_token);
    const jira =
      resources.find((r) => r.id && (r.url || "").includes(".atlassian.net")) ||
      resources[0];

    await upsertToken({
      teamsUserId: state,
      atlassianAccountId: "me",
      cloudId: jira.id,
      refreshToken: tok.refresh_token,
    });

    reply
      .type("text/html")
      .send(
        "<script>window.close && window.close();</script><p>Conectado! Pode voltar ao Teams.</p>"
      );
  });
}
