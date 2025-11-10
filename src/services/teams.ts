import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  TeamsActivityHandler,
  TurnContext,
} from "botbuilder";
import {
  jiraAddWorklog,
  jiraSearch,
  jiraTransitions,
  jiraDoTransition,
} from "./jira.js";

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MicrosoftAppId || "",
  MicrosoftAppPassword: process.env.MicrosoftAppPassword || "",
  MicrosoftAppType: process.env.MicrosoftAppType || "SingleTenant",
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId || "",
});
const botFrameworkAuthentication =
  createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);
export const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context, error) => {
  console.error("TurnError:", error);
  await context.sendActivity("😬 Ocorreu um erro. Tente novamente.");
};

function toStarted(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}:00.000-0300`;
}

export class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      const textRaw =
        TurnContext.removeRecipientMention(context.activity)?.trim() ||
        context.activity.text ||
        "";
      const text = textRaw.toLowerCase();

      const auth = context.turnState.get("auth") as
        | { accessToken?: string; cloudId?: string }
        | undefined;
      if (text.startsWith("login")) {
        const teamsUserId = context.activity.from?.id || "";
        await context.sendActivity(
          `Clique para entrar no Jira: ${
            process.env.APP_BASE_URL || ""
          }/api/auth/start?teamsUserId=${encodeURIComponent(teamsUserId)}`
        );
        return;
      }
      if (!auth?.accessToken || !auth?.cloudId) {
        await context.sendActivity(
          "Você precisa entrar com Atlassian. Envie **login**."
        );
        await next();
        return;
      }

      if (text.startsWith("minhas demandas") || text.startsWith("listar")) {
        const jql =
          "assignee=currentUser() AND statusCategory != Done ORDER BY updated DESC";
        try {
          const r = await jiraSearch(auth.accessToken!, auth.cloudId!, jql);
          const items =
            r.issues
              ?.map(
                (it: any) =>
                  `• ${it.key} — ${it.fields?.summary} [${it.fields?.status?.name}]`
              )
              .join("\n") || "Nenhuma.";
          await context.sendActivity(`Suas tarefas:\n${items}`);
        } catch (e: any) {
          await context.sendActivity(`Falha ao listar: ${e.message}`);
        }
        return;
      }

      const m = text.match(
        /lan(c|ç)ar\s+(\d+(?:[.,]\d+)?)h.*?\b([a-z0-9]+-\d+)\b.*?(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/i
      );
      if (m) {
        const hours = parseFloat(m[2].replace(",", "."));
        const issue = m[3].toUpperCase();
        const started = toStarted(m[4], m[5]);
        try {
          const r = await jiraAddWorklog(
            auth.accessToken!,
            auth.cloudId!,
            issue,
            started,
            hours
          );
          await context.sendActivity(
            `✅ ${hours}h lançadas em **${issue}** às ${m[4]} ${m[5]} (worklogId ${r.id}).`
          );
        } catch (e: any) {
          await context.sendActivity(`⚠️ Erro ao lançar: ${e.message}`);
        }
        await next();
        return;
      }

      const st = text.match(/^status\s+([a-z0-9]+-\d+)/i);
      if (st) {
        const issue = st[1].toUpperCase();
        try {
          const r = await jiraTransitions(
            auth.accessToken!,
            auth.cloudId!,
            issue
          );
          const opts =
            r.transitions?.map((t: any) => `${t.id}:${t.name}`).join(" | ") ||
            "Nenhuma.";
          await context.sendActivity(
            `Transitions de ${issue}: ${opts}\nUse: mover ${issue} ID_DA_TRANSITION`
          );
        } catch (e: any) {
          await context.sendActivity(
            `Erro ao listar transitions: ${e.message}`
          );
        }
        return;
      }

      const mv = text.match(/^mover\s+([a-z0-9]+-\d+)\s+(\d+)/i);
      if (mv) {
        const issue = mv[1].toUpperCase();
        const tId = mv[2];
        try {
          await jiraDoTransition(auth.accessToken!, auth.cloudId!, issue, tId);
          await context.sendActivity(`✅ ${issue} movida (transition ${tId}).`);
        } catch (e: any) {
          await context.sendActivity(`Erro ao mover: ${e.message}`);
        }
        return;
      }

      await context.sendActivity(
        "Comandos: **login**, **minhas demandas**, **lançar 1h na PORTAL-XXXX 2025-11-07 14:00**, **status PORTAL-XXXX**, **mover PORTAL-XXXX 31**"
      );
      await next();
    });
  }
}
