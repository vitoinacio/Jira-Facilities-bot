import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { getTokenByTeamsUser, decrypt, upsertToken } from "../services/db.js";
import { refreshTokens, getAccessibleResources } from "../services/auth.js";
import {
  jiraAddWorklog,
  jiraSearch,
  jiraTransitions,
  jiraDoTransition,
} from "../services/jira.js";

function verifyHmac(reqBody: any, headerAuth?: string) {
  if (!headerAuth?.startsWith("HMAC ")) return false;
  const sig = headerAuth.slice(5).trim();
  const secret = process.env.TEAMS_OUTGOING_SECRET || "";
  if (!secret) return false;
  const bodyStr =
    typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody);
  const computed = crypto
    .createHmac("sha256", secret)
    .update(bodyStr, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
}

function toStarted(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}:00.000-0300`;
}

export default async function teamsOutgoingRoutes(app: FastifyInstance) {
  app.post("/teams/outgoing", async (req, reply) => {
    const authHeader = (req.headers["authorization"] as string) || "";
    const ok = verifyHmac(req.body, authHeader);
    if (!ok) {
      return reply.code(401).send({ text: "Assinatura inválida (HMAC)." });
    }

    const body = (req.body as any) || {};
    const textRaw: string = body.text || "";
    const text = textRaw.toLowerCase();
    const teamsUserId: string = body?.from?.id || body?.user?.id || "unknown";

    if (text.startsWith("login")) {
      const url = `${
        process.env.APP_BASE_URL || ""
      }/api/auth/start?teamsUserId=${encodeURIComponent(teamsUserId)}`;
      return reply.send({
        text: `Abra para conectar ao Jira (uma vez): ${url}`,
      });
    }

    let accessToken: string | undefined;
    let cloudId: string | undefined;

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
      accessToken = refreshed.access_token;
      cloudId = jira.id;
    }

    if (!accessToken || !cloudId) {
      const url = `${
        process.env.APP_BASE_URL || ""
      }/api/auth/start?teamsUserId=${encodeURIComponent(teamsUserId)}`;
      return reply.send({
        text: `Você precisa conectar sua conta Jira: ${url}`,
      });
    }

    if (text.startsWith("minhas demandas") || text.startsWith("listar")) {
      const jql =
        "assignee=currentUser() AND statusCategory != Done ORDER BY updated DESC";
      try {
        const r = await jiraSearch(accessToken, cloudId, jql);
        const items =
          r.issues
            ?.map(
              (it) =>
                `• ${it.key} — ${it.fields?.summary} [${it.fields?.status?.name}]`
            )
            .join("\n") || "Nenhuma.";
        return reply.send({ text: `Suas tarefas:\n${items}` });
      } catch (e: any) {
        return reply.send({ text: `Falha ao listar: ${e.message}` });
      }
    }

    const m = text.match(
      /lan(c|ç)ar\s+(\d+(?:[.,]\d+)?)h.*?\b([a-z0-9]+-\d+)\b.*?(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/i
    );
    if (m) {
      const hours = parseFloat(m[2].replace(",", "."));
      const issue = m[3].toUpperCase();
      const started = toStarted(m[4], m[5]);
      try {
        const w = await jiraAddWorklog(
          accessToken,
          cloudId,
          issue,
          started,
          hours
        );
        return reply.send({
          text: `✅ ${hours}h lançadas em ${issue} às ${m[4]} ${m[5]} (worklogId ${w.id}).`,
        });
      } catch (e: any) {
        return reply.send({ text: `⚠️ Erro ao lançar: ${e.message}` });
      }
    }

    const st = text.match(/^status\s+([a-z0-9]+-\d+)/i);
    if (st) {
      const issue = st[1].toUpperCase();
      try {
        const r = await jiraTransitions(accessToken, cloudId, issue);
        const opts =
          r.transitions?.map((t) => `${t.id}:${t.name}`).join(" | ") ||
          "Nenhuma.";
        return reply.send({
          text: `Transitions de ${issue}: ${opts}\nUse: mover ${issue} ID_DA_TRANSITION`,
        });
      } catch (e: any) {
        return reply.send({ text: `Erro ao listar transitions: ${e.message}` });
      }
    }

    const mv = text.match(/^mover\s+([a-z0-9]+-\d+)\s+(\d+)/i);
    if (mv) {
      const issue = mv[1].toUpperCase();
      const tId = mv[2];
      try {
        await jiraDoTransition(accessToken, cloudId, issue, tId);
        return reply.send({ text: `✅ ${issue} movida (transition ${tId}).` });
      } catch (e: any) {
        return reply.send({ text: `Erro ao mover: ${e.message}` });
      }
    }

    return reply.send({
      text: "Comandos: login | minhas demandas | lançar 1h na PORTAL-XXXX 2025-11-07 14:00 | status PORTAL-XXXX | mover PORTAL-XXXX 31",
    });
  });
}
