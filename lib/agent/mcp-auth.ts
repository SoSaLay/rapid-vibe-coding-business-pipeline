/**
 * "Quick start with AI (MCPs)": sign in to a database provider through its official MCP server's
 * OAuth (a browser popup), then create the agent's database with that sign-in.
 *
 *  - Neon: the MCP server is its own OAuth server, so the token only works there → the database is
 *    created by calling the Neon MCP server's tools (create_project).
 *  - Supabase: the MCP server's sign-in is Supabase's own OAuth → the same token creates the project
 *    through the Management API (so we choose the password and get a working connection string).
 *
 * The app registers itself with each provider on first use (OAuth dynamic client registration, PKCE),
 * keeps tokens in data/connectors/mcp-<provider>.json, and refreshes them when they expire.
 */

import { createHash, randomBytes } from "crypto";
import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";

export type McpProvider = "neon" | "supabase";

const PROVIDERS: Record<McpProvider, { metadata: string; mcpUrl: string; resource: string; scope: string; name: string }> = {
  neon: {
    metadata: "https://mcp.neon.tech/.well-known/oauth-authorization-server",
    mcpUrl: "https://mcp.neon.tech/mcp",
    resource: "https://mcp.neon.tech",
    scope: "read write",
    name: "Neon",
  },
  supabase: {
    metadata: "https://api.supabase.com/.well-known/oauth-authorization-server",
    mcpUrl: "https://mcp.supabase.com/mcp",
    resource: "https://mcp.supabase.com/mcp",
    scope: "organizations:read projects:read projects:write database:read database:write",
    name: "Supabase",
  },
};

interface Saved {
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  /** In-flight sign-in: state → PKCE verifier. */
  pending?: Record<string, string>;
}

const key = (p: McpProvider) => `mcp-${p}`;
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function load(p: McpProvider): Promise<Saved> {
  return ((await readConnectorConfig(key(p))) as Saved | null) ?? {};
}
async function save(p: McpProvider, s: Saved) {
  await saveConnectorConfig(key(p), s as any);
}
async function meta(p: McpProvider): Promise<any> {
  const r = await fetch(PROVIDERS[p].metadata);
  if (!r.ok) throw new Error(`${PROVIDERS[p].name} sign-in isn't reachable (${r.status}).`);
  return r.json();
}

/** Register this app with the provider (once per redirect address). */
async function ensureClient(p: McpProvider, redirectUri: string): Promise<Saved> {
  const s = await load(p);
  if (s.client_id && s.redirect_uri === redirectUri) return s;
  const m = await meta(p);
  const r = await fetch(m.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Rapid Vibe Coding Pipeline",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: p === "supabase" ? "client_secret_post" : "none",
      scope: PROVIDERS[p].scope,
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_id) throw new Error(`${PROVIDERS[p].name} didn't accept the app registration: ${j.error_description || j.message || r.status}`);
  const next = { ...s, redirect_uri: redirectUri, client_id: j.client_id, client_secret: j.client_secret, access_token: undefined, refresh_token: undefined };
  await save(p, next);
  return next;
}

/** The sign-in page to open in a popup. */
export async function authorizeUrl(p: McpProvider, origin: string): Promise<string> {
  const redirectUri = `${origin}/api/mcp-auth/callback`;
  const s = await ensureClient(p, redirectUri);
  const m = await meta(p);
  const verifier = b64url(randomBytes(32));
  const state = `${p}.${b64url(randomBytes(16))}`;
  await save(p, { ...s, pending: { ...(s.pending ?? {}), [state]: verifier } });
  const u = new URL(m.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", s.client_id!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", PROVIDERS[p].scope);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("resource", PROVIDERS[p].resource);
  return u.toString();
}

async function tokenRequest(p: McpProvider, s: Saved, body: Record<string, string>) {
  const m = await meta(p);
  const form = new URLSearchParams({ ...body, client_id: s.client_id!, ...(s.client_secret ? { client_secret: s.client_secret } : {}), resource: PROVIDERS[p].resource });
  const r = await fetch(m.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`${PROVIDERS[p].name} sign-in failed: ${j.error_description || j.error || r.status}`);
  await save(p, {
    ...s,
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? s.refresh_token,
    expires_at: j.expires_in ? Date.now() + (j.expires_in - 60) * 1000 : undefined,
  });
}

/** The popup came back with a code: trade it for tokens. */
export async function finishAuth(state: string, code: string): Promise<McpProvider> {
  const p = state.split(".")[0] as McpProvider;
  if (!(p in PROVIDERS)) throw new Error("Unknown sign-in.");
  const s = await load(p);
  const verifier = s.pending?.[state];
  if (!verifier) throw new Error("This sign-in expired. Try Quick start again.");
  const { [state]: _done, ...rest } = s.pending ?? {};
  await tokenRequest(p, { ...s, pending: rest }, { grant_type: "authorization_code", code, redirect_uri: s.redirect_uri!, code_verifier: verifier });
  return p;
}

/** A valid access token, refreshed if needed; null = sign in first. */
export async function mcpToken(p: McpProvider): Promise<string | null> {
  const s = await load(p);
  if (!s.access_token) return null;
  if (s.expires_at && Date.now() > s.expires_at) {
    if (!s.refresh_token) return null;
    try {
      await tokenRequest(p, s, { grant_type: "refresh_token", refresh_token: s.refresh_token });
    } catch {
      return null;
    }
    return (await load(p)).access_token ?? null;
  }
  return s.access_token;
}

/* ---------------- a minimal MCP client (Streamable HTTP, JSON-RPC) ---------------- */

async function rpc(p: McpProvider, token: string, session: string | null, body: unknown): Promise<{ result: any; session: string | null }> {
  const r = await fetch(PROVIDERS[p].mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(session ? { "Mcp-Session-Id": session } : {}),
    },
    body: JSON.stringify(body),
  });
  const sid = r.headers.get("mcp-session-id") ?? session;
  if (r.status === 202) return { result: null, session: sid };
  const text = await r.text();
  if (!r.ok) throw new Error(`${PROVIDERS[p].name} MCP error ${r.status}: ${text.slice(0, 300)}`);
  // JSON, or server-sent events whose data lines carry the JSON-RPC response.
  const payload = text.trim().startsWith("{")
    ? text
    : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean).pop() ?? "{}";
  const j = JSON.parse(payload);
  if (j.error) throw new Error(`${PROVIDERS[p].name} MCP: ${j.error.message ?? "error"}`);
  return { result: j.result, session: sid };
}

/** Call one tool on the provider's MCP server; returns its text output. */
export async function callMcpTool(p: McpProvider, tool: string, args: Record<string, unknown>): Promise<string> {
  const token = await mcpToken(p);
  if (!token) throw new Error(`Sign in to ${PROVIDERS[p].name} first.`);
  const init = await rpc(p, token, null, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rapid-vibe-coding-pipeline", version: "1.0" } },
  });
  await rpc(p, token, init.session, { jsonrpc: "2.0", method: "notifications/initialized" });
  const { result } = await rpc(p, token, init.session, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
  const text = (result?.content ?? []).map((c: any) => c.text ?? "").join("\n");
  if (result?.isError) throw new Error(text.slice(0, 400) || `${tool} failed.`);
  return text;
}

/** Neon through its MCP server: create a project and return its connection string. */
export async function createNeonViaMcp(name: string): Promise<string> {
  let out: string;
  try {
    out = await callMcpTool("neon", "create_project", { name });
  } catch (e: any) {
    // Accounts in an organization must say which one.
    if (!/org/i.test(String(e?.message))) throw e;
    const orgs = await callMcpTool("neon", "list_organizations", {});
    const org = /org-[a-z0-9-]+/i.exec(orgs)?.[0];
    if (!org) throw e;
    out = await callMcpTool("neon", "create_project", { name, org_id: org });
  }
  let uri = /postgres(?:ql)?:\/\/[^\s"'`)]+/.exec(out)?.[0];
  if (!uri) {
    const projectId = /\b([a-z]+-[a-z]+-\d{6,})\b/.exec(out)?.[1];
    if (projectId) uri = /postgres(?:ql)?:\/\/[^\s"'`)]+/.exec(await callMcpTool("neon", "get_connection_string", { projectId }))?.[0];
  }
  if (!uri) throw new Error("Neon created the project but didn't return a connection string.");
  return uri;
}

export function providerName(p: McpProvider) {
  return PROVIDERS[p].name;
}
