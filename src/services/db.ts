import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE!;
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const secretB64 = process.env.CRYPTO_SECRET || "";
function getKey() {
  const buf = Buffer.from(secretB64, "base64");
  if (buf.length !== 32)
    throw new Error("CRYPTO_SECRET must be 32 bytes in base64");
  return buf;
}
export function encrypt(plain: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}
export function decrypt(encB64: string, ivB64: string, tagB64: string) {
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export async function saveCodeVerifier(
  teamsUserId: string,
  codeVerifier: string
) {
  const { error } = await supabase.from("oauth_state").upsert({
    teams_user_id: teamsUserId,
    code_verifier: codeVerifier,
  });
  if (error) throw error;
}
export async function getCodeVerifier(teamsUserId: string) {
  const { data, error } = await supabase
    .from("oauth_state")
    .select("*")
    .eq("teams_user_id", teamsUserId)
    .single();
  if (error || !data) return null;
  return data.code_verifier as string;
}

export async function upsertToken(params: {
  teamsUserId: string;
  atlassianAccountId: string;
  cloudId: string;
  refreshToken: string;
}) {
  const { enc, iv, tag } = encrypt(params.refreshToken);
  const { error } = await supabase.from("jira_tokens").upsert(
    {
      teams_user_id: params.teamsUserId,
      atlassian_account_id: params.atlassianAccountId,
      cloud_id: params.cloudId,
      refresh_token_enc: enc,
      iv,
      tag,
    },
    { onConflict: "teams_user_id" }
  );
  if (error) throw error;
}

export async function getTokenByTeamsUser(teamsUserId: string) {
  const { data, error } = await supabase
    .from("jira_tokens")
    .select("*")
    .eq("teams_user_id", teamsUserId)
    .single();
  if (error || !data) return null;
  return data as {
    teams_user_id: string;
    atlassian_account_id: string;
    cloud_id: string;
    refresh_token_enc: string;
    iv: string;
    tag: string;
  };
}
