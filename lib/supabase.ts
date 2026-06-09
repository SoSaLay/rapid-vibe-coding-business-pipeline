/**
 * Supabase integration — the waitlist store for Pre-Marketing.
 *
 * The generated landing page (client-side, anon key) INSERTs signups into a
 * `signups` table; the pipeline (server-side, service key) READs them back for
 * the demand dashboard. Config is pasted in-app and stored locally.
 */

import { readConnectorConfig, saveConnectorConfig } from "./connectors/config";

const ID = "supabase";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export interface Signup {
  id: string;
  created_at: string;
  project_id: string;
  email: string;
  answers: Record<string, any>;
  wants_presale: boolean;
  source: string;
}

/** One-time SQL the user runs in the Supabase SQL editor to create the table + allow anon inserts. */
export const SIGNUPS_TABLE_SQL = `create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  project_id text not null,
  email text not null,
  answers jsonb default '{}'::jsonb,
  wants_presale boolean default false,
  source text default 'landing'
);
alter table public.signups enable row level security;
create policy "anon can insert signups"
  on public.signups for insert to anon with check (true);`;

export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  const c = await readConnectorConfig(ID);
  if (!c?.url || !c?.anonKey || !c?.serviceKey) return null;
  return { url: c.url.replace(/\/+$/, ""), anonKey: c.anonKey, serviceKey: c.serviceKey };
}

export async function isSupabaseConfigured(): Promise<boolean> {
  return !!(await getSupabaseConfig());
}

export async function configureSupabase(
  cfg: SupabaseConfig
): Promise<{ ok: boolean; error?: string; tableMissing?: boolean }> {
  const url = (cfg.url || "").trim().replace(/\/+$/, "");
  const anonKey = (cfg.anonKey || "").trim();
  const serviceKey = (cfg.serviceKey || "").trim();
  if (!url || !anonKey || !serviceKey) return { ok: false, error: "URL, anon key, and service key are all required." };
  try {
    const res = await fetch(`${url}/rest/v1/signups?select=id&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid service key or URL." };
    const tableMissing = res.status === 404 || res.status === 400;
    await saveConnectorConfig(ID, { url, anonKey, serviceKey });
    return { ok: true, tableMissing };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach Supabase." };
  }
}

export async function listSignups(projectId: string): Promise<Signup[]> {
  const cfg = await getSupabaseConfig();
  if (!cfg) throw new Error("Supabase is not connected.");
  const res = await fetch(
    `${cfg.url}/rest/v1/signups?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=created_at.desc`,
    { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` } }
  );
  if (!res.ok) throw new Error(`Failed to read signups (${res.status}).`);
  return (await res.json()) as Signup[];
}
