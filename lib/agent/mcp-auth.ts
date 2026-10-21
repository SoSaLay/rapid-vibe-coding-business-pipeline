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
import { mcpService, type McpService } from "./mcp-catalog";

/** A service id from the MCP catalog (lib/agent/mcp-catalog.ts), e.g. "neon", "notion". */
export type McpProvider = string;

/** The app's registration with a provider, plus the pipeline's own sign-in (Quick start). */
interface Saved extends Grant {
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  /** In-flight sign-ins: state → PKCE verifier, and the agent it's for ("" = the pipeline itself). */
  pending?: Record<string, string | { verifier: string; project: string }>;
}

/** One sign-in's tokens. An agent gets its own (so it can refresh them without disturbing anyone else's). */
export interface Grant {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

interface Meta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
}

const key = (p: McpProvider) => `mcp-${p}`;
const grantKey = (p: McpProvider, project: string) => `mcp-agent-${project.replace(/[^a-zA-Z0-9-]/g, "")}-${p}`;
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function service(p: McpProvider): McpService {
  const s = mcpService(p);
  if (!s) throw new Error(`No sign-in for "${p}".`);
  return s;
}
const resourceOf = (p: McpProvider) => service(p).resource ?? service(p).url;

async function load(p: McpProvider): Promise<Saved> {
  return ((await readConnectorConfig(key(p))) as Saved | null) ?? {};
}
async function save(p: McpProvider, s: Saved) {
  await saveConnectorConfig(key(p), s as any);
}
async function loadGrant(p: McpProvider, project?: string): Promise<Grant> {
  if (!project) return load(p);
  return ((await readConnectorConfig(grantKey(p, project))) as Grant | null) ?? {};
}
async function saveGrant(p: McpProvider, project: string | undefined, g: Grant) {
  if (!project) await save(p, { ...(await load(p)), ...g });
  else await saveConnectorConfig(grantKey(p, project), g as any);
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** The well-known URLs for a base URL with a path (RFC 8414 puts the path after the well-known part). */
function wellKnown(base: string, name: string): string[] {
  const u = new URL(base);
  const path = u.pathname.replace(/\/+$/, "");
  return [...(path ? [`${u.origin}/.well-known/${name}${path}`, `${u.origin}${path}/.well-known/${name}`] : []), `${u.origin}/.well-known/${name}`];
}

const metaCache = new Map<McpProvider, Meta>();

/** Find the provider's OAuth server: from the MCP server's protected-resource metadata, then the usual places. */
async function meta(p: McpProvider): Promise<Meta> {
  const hit = metaCache.get(p);
  if (hit) return hit;
  const svc = service(p);
  const tries: string[] = [];
  if (svc.metadata) tries.push(svc.metadata);
  for (const u of wellKnown(svc.url, "oauth-protected-resource")) {
    const prm = await getJson(u);
    const as = prm?.authorization_servers?.[0];
    if (as) {
      tries.push(...wellKnown(as, "oauth-authorization-server"), ...wellKnown(as, "openid-configuration"));
      break;
    }
  }
  tries.push(...wellKnown(svc.url, "oauth-authorization-server"));
  for (const u of tries) {
    const m = await getJson(u);
    if (m?.authorization_endpoint && m?.token_endpoint) {
      metaCache.set(p, m);
      return m;
    }
  }
  throw new Error(`${svc.label} sign-in isn't reachable right now.`);
}

/** Register this app with the provider (once per redirect address). */
async function ensureClient(p: McpProvider, redirectUri: string): Promise<Saved> {
  const s = await load(p);
  if (s.client_id && s.redirect_uri === redirectUri) return s;
  const m = await meta(p);
  if (!m.registration_endpoint) throw new Error(`${service(p).label} doesn't let apps sign in on their own: paste a key instead.`);
  // A public app (PKCE, no secret) where the provider allows it; otherwise it hands us a secret.
  const method = (m.token_endpoint_auth_methods_supported ?? ["none"]).includes("none") && p !== "supabase" ? "none" : "client_secret_post";
  const r = await fetch(m.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Rapid Vibe Coding Pipeline",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      ...(service(p).scope ? { scope: service(p).scope } : {}),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_id) throw new Error(`${service(p).label} didn't accept the app registration: ${j.error_description || j.message || r.status}`);
  const next = { ...s, redirect_uri: redirectUri, client_id: j.client_id, client_secret: j.client_secret, access_token: undefined, refresh_token: undefined };
  await save(p, next);
  return next;
}

/** The sign-in page to open in a popup. With `project`, the sign-in is that agent's own. */
export async function authorizeUrl(p: McpProvider, origin: string, project?: string): Promise<string> {
  const redirectUri = `${origin}/api/mcp-auth/callback`;
  const s = await ensureClient(p, redirectUri);
  const m = await meta(p);
  const verifier = b64url(randomBytes(32));
  const state = `${p}.${b64url(randomBytes(16))}`;
  await save(p, { ...s, pending: { ...(s.pending ?? {}), [state]: { verifier, project: project ?? "" } } });
  const u = new URL(m.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", s.client_id!);
  u.searchParams.set("redirect_uri", redirectUri);
  if (service(p).scope) u.searchParams.set("scope", service(p).scope!);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("resource", resourceOf(p));
  return u.toString();
}

async function tokenRequest(p: McpProvider, project: string | undefined, prev: Grant, body: Record<string, string>) {
  const m = await meta(p);
  const s = await load(p);
  const form = new URLSearchParams({ ...body, client_id: s.client_id!, ...(s.client_secret ? { client_secret: s.client_secret } : {}), resource: resourceOf(p) });
  const r = await fetch(m.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`${service(p).label} sign-in failed: ${j.error_description || j.error || r.status}`);
  await saveGrant(p, project, {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? prev.refresh_token,
    expires_at: j.expires_in ? Date.now() + (j.expires_in - 60) * 1000 : undefined,
  });
}

/** The popup came back with a code: trade it for tokens. Returns the provider and the agent it was for. */
export async function finishAuth(state: string, code: string): Promise<{ provider: McpProvider; project?: string }> {
  const p = state.split(".")[0];
  if (!mcpService(p)) throw new Error("Unknown sign-in.");
  const s = await load(p);
  const pending = s.pending?.[state];
  if (!pending) throw new Error("This sign-in expired. Try again.");
  const { verifier, project } = typeof pending === "string" ? { verifier: pending, project: "" } : pending;
  const { [state]: _done, ...rest } = s.pending ?? {};
  await save(p, { ...s, pending: rest });
  await tokenRequest(p, project || undefined, {}, { grant_type: "authorization_code", code, redirect_uri: s.redirect_uri!, code_verifier: verifier });
  return { provider: p, project: project || undefined };
}

/** A valid access token, refreshed if needed; null = sign in first. With `project`: that agent's own sign-in. */
export async function mcpToken(p: McpProvider, project?: string): Promise<string | null> {
  const g = await loadGrant(p, project);
  if (!g.access_token) return null;
  if (g.expires_at && Date.now() > g.expires_at) {
    if (!g.refresh_token) return null;
    try {
      await tokenRequest(p, project, g, { grant_type: "refresh_token", refresh_token: g.refresh_token });
    } catch {
      return null;
    }
    return (await loadGrant(p, project)).access_token ?? null;
  }
  return g.access_token;
}

/** An agent's sign-in as handed to the agent itself (it refreshes on its own from then on). Null = not signed in. */
export async function agentGrant(p: McpProvider, project: string) {
  const g = await loadGrant(p, project);
  if (!g.access_token) return null;
  const m = await meta(p);
  const s = await load(p);
  return { ...g, token_url: m.token_endpoint, client_id: s.client_id!, client_secret: s.client_secret, resource: resourceOf(p) };
}

/** Forget an agent's sign-in (switching back to a pasted key). */
export async function forgetAgentGrant(p: McpProvider, project: string) {
  await saveConnectorConfig(grantKey(p, project), {} as any);
}

/* ---------------- a minimal MCP client (Streamable HTTP, JSON-RPC) ---------------- */

async function rpc(p: McpProvider, token: string, session: string | null, body: unknown): Promise<{ result: any; session: string | null }> {
  const r = await fetch(service(p).url, {
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
  if (!r.ok) throw new Error(`${service(p).label} MCP error ${r.status}: ${text.slice(0, 300)}`);
  // JSON, or server-sent events whose data lines carry the JSON-RPC response.
  const payload = text.trim().startsWith("{")
    ? text
    : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean).pop() ?? "{}";
  const j = JSON.parse(payload);
  if (j.error) throw new Error(`${service(p).label} MCP: ${j.error.message ?? "error"}`);
  return { result: j.result, session: sid };
}

/** Call one tool on the provider's MCP server; returns its text output. */
export async function callMcpTool(p: McpProvider, tool: string, args: Record<string, unknown>): Promise<string> {
  const token = await mcpToken(p);
  if (!token) throw new Error(`Sign in to ${service(p).label} first.`);
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
  return service(p).label;
}
