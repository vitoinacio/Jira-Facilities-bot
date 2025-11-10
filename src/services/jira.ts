import fetch from "node-fetch";

const API_BASE = "https://api.atlassian.com";

export interface JiraIssue {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    assignee?: any;
    updated?: string;
  };
}

export interface JiraSearchResponse {
  issues?: JiraIssue[];
}

export interface JiraTransitionsResponse {
  transitions?: Array<{ id: string; name: string }>;
}

export interface JiraWorklogResponse {
  id: string;
}

export async function jiraSearch(
  accessToken: string,
  cloudId: string,
  jql: string,
  fields = "key,summary,status,assignee,updated"
): Promise<JiraSearchResponse> {
  const url = `${API_BASE}/ex/jira/${cloudId}/rest/api/3/search?jql=${encodeURIComponent(
    jql
  )}&fields=${encodeURIComponent(fields)}&maxResults=10`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as JiraSearchResponse;
}

export async function jiraTransitions(
  accessToken: string,
  cloudId: string,
  issueKey: string
): Promise<JiraTransitionsResponse> {
  const url = `${API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as JiraTransitionsResponse;
}

export async function jiraDoTransition(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  transitionId: string
): Promise<void> {
  const url = `${API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function jiraAddWorklog(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  startedISO: string,
  hours: number,
  comment?: string
): Promise<JiraWorklogResponse> {
  const url = `${API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/worklog`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      started: startedISO,
      timeSpent: `${hours}h`,
      comment: comment || "Jira Facilities Bot",
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as JiraWorklogResponse;
}
