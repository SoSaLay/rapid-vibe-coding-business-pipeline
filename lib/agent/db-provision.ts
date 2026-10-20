/**
 * "Create a database for me": provisions a free Postgres for one agent through the provider's
 * API and returns its connection string. Neon is instant (key in data/connectors/neon.json);
 * Supabase takes a minute or two (personal access token in data/connectors/supabase-mgmt.json).
 */

import { readConnectorConfig } from "../connectors/config";

const NEON_API = "https://console.neon.tech/api/v2";

export async function neonKey(): Promise<string | null> {
  return (await readConnectorConfig("neon"))?.apiKey || process.env.NEON_API_KEY || null;
}

export async function verifyNeonKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${NEON_API}/projects?limit=1`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  return r.ok ? { ok: true } : { ok: false, error: `Neon rejected the key (${r.status}).` };
}

/** Create a Neon project for this agent and return its pooled connection string. */
export async function createNeonDatabase(apiKey: string, name: string, orgId?: string): Promise<string> {
  const r = await fetch(`${NEON_API}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ project: { name: name.slice(0, 60), ...(orgId ? { org_id: orgId } : {}) } }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Neon couldn't create the database: ${j?.message || r.status}`);
  const uri: string | undefined = j?.connection_uris?.[0]?.connection_uri;
  if (!uri) throw new Error("Neon created the project but returned no connection string.");
  // The pooled host handles many short connections better; same credentials.
  const pooler: string | undefined = j?.connection_uris?.[0]?.connection_parameters?.pooler_host;
  const host: string | undefined = j?.connection_uris?.[0]?.connection_parameters?.host;
  return pooler && host ? uri.replace(host, pooler) : uri;
}

/* ---------------- Supabase (Management API, personal access token) ---------------- */

const SUPABASE_API = "https://api.supabase.com/v1";

export async function supabaseToken(): Promise<string | null> {
  return (await readConnectorConfig("supabase-mgmt"))?.accessToken || process.env.SUPABASE_ACCESS_TOKEN || null;
}

const sbHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" });

export async function verifySupabaseToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${SUPABASE_API}/organizations`, { headers: sbHeaders(token) });
  return r.ok ? { ok: true } : { ok: false, error: `Supabase rejected the token (${r.status}).` };
}

/**
 * Create a free Supabase project for this agent, wait until it's up (usually 1–3 minutes),
 * and return its session-pooler connection string (works over IPv4, unlike the direct host).
 */
export async function createSupabaseDatabase(token: string, name: string, opts: { orgId?: string; region?: string } = {}): Promise<string> {
  let orgId = opts.orgId;
  if (!orgId) {
    const orgs: any = await fetch(`${SUPABASE_API}/organizations`, { headers: sbHeaders(token) }).then((r) => r.json()).catch(() => null);
    orgId = Array.isArray(orgs) ? orgs[0]?.id : undefined;
    if (!orgId) throw new Error("No Supabase organization found for this token.");
  }
  const password = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  const region = opts.region || "us-east-1";
  const created = await fetch(`${SUPABASE_API}/projects`, {
    method: "POST",
    headers: sbHeaders(token),
    body: JSON.stringify({ name: name.slice(0, 60), organization_id: orgId, db_pass: password, region }),
  });
  const p: any = await created.json().catch(() => ({}));
  if (!created.ok) throw new Error(`Supabase couldn't create the project: ${p?.message || p?.error || created.status}`);
  const ref: string = p.id ?? p.ref;
  if (!ref) throw new Error("Supabase created the project but returned no id.");

  // New projects take a minute or two to come up.
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    const s: any = await fetch(`${SUPABASE_API}/projects/${ref}`, { headers: sbHeaders(token) }).then((r) => r.json()).catch(() => ({}));
    if (s?.status === "ACTIVE_HEALTHY") break;
    if (Date.now() > deadline) throw new Error("Supabase is still setting up the project. Try Save & set up in a few minutes.");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Transaction pooler (port 6543): built for many short-lived clients, like an agent host running
  // one copy per session. (The session pooler on 5432 caps clients at the pool size.) IPv4-friendly.
  const pooler: any = await fetch(`${SUPABASE_API}/projects/${ref}/config/database/pooler`, { headers: sbHeaders(token) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const entry = Array.isArray(pooler) ? pooler.find((x: any) => x?.database_type === "PRIMARY") ?? pooler[0] : pooler;
  if (entry?.db_host && entry?.db_user) {
    return `postgresql://${entry.db_user}:${password}@${entry.db_host}:6543/${entry.db_name || "postgres"}`;
  }
  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
}

/** A Supabase session-pooler string (…pooler.supabase.com:5432) → the transaction pooler (6543). Others unchanged. */
export function serverlessDatabaseUrl(url: string): string {
  return /\.pooler\.supabase\.com:5432\//.test(url) ? url.replace(/(\.pooler\.supabase\.com):5432\//, "$1:6543/") : url;
}
