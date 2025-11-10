import fetch from "node-fetch";

const AUTH_BASE = "https://auth.atlassian.com";
const API_BASE = "https://api.atlassian.com";

export function buildAuthUrl(state: string, codeVerifier: string) {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.ATLASSIAN_CLIENT_ID!,
    scope: process.env.ATLASSIAN_SCOPES!,
    redirect_uri: process.env.ATLASSIAN_REDIRECT_URI!,
    state,
    response_type: "code",
    prompt: "consent",
    code_challenge: codeVerifier,
    code_challenge_method: "plain",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
) {
  const r = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.ATLASSIAN_CLIENT_ID!,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.ATLASSIAN_REDIRECT_URI!,
      code_verifier: codeVerifier,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  }>;
}

export async function refreshTokens(refreshToken: string) {
  const r = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.ATLASSIAN_CLIENT_ID!,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function getAccessibleResources(accessToken: string) {
  const r = await fetch(`${API_BASE}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<
    Array<{ id: string; name: string; url: string; scopes: string[] }>
  >;
}
