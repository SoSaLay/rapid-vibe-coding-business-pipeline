/**
 * "Create a database for me": provisions a free Postgres for one agent through the provider's
 * API and returns its connection string. Neon is instant; the key lives in data/connectors/neon.json.
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
