/**
 * Exa search client — the online-signal source for Idea Validation.
 *
 * We use Exa to pull what real people say in forums/communities about a problem.
 * (Reddit is intentionally not used — Exa has no Reddit index since Reddit
 * walled off crawlers in 2024.) Key is pasted in-app and stored locally.
 */

import { readConnectorConfig, saveConnectorConfig } from "./connectors/config";

const ID = "exa";

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  summary?: string;
  highlights?: string[];
}

async function getApiKey(): Promise<string | null> {
  const config = await readConnectorConfig(ID);
  return config?.apiKey || process.env.EXA_API_KEY || null;
}

export async function isExaConfigured(): Promise<boolean> {
  return !!(await getApiKey());
}

export async function configureExa(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey?.trim();
  if (!key) return { ok: false, error: "Missing Exa API key." };
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", numResults: 1 }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid Exa API key." };
    if (!res.ok) return { ok: false, error: `Exa error ${res.status}.` };
    await saveConnectorConfig(ID, { apiKey: key });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach Exa." };
  }
}

const MONTHS_18_MS = 18 * 30 * 24 * 3600 * 1000;

export async function exaSearch(args: {
  query: string;
  domains?: string[];
  numResults?: number;
  summaryFocus?: string;
  recentOnly?: boolean;
}): Promise<ExaResult[]> {
  const key = await getApiKey();
  if (!key) throw new Error("Exa is not connected.");

  const body: Record<string, unknown> = {
    query: args.query,
    type: "auto",
    numResults: args.numResults ?? 6,
    contents: {
      highlights: true,
      summary: args.summaryFocus ? { query: args.summaryFocus } : true,
    },
  };
  if (args.domains && args.domains.length) body.includeDomains = args.domains;
  if (args.recentOnly !== false) body.startPublishedDate = new Date(Date.now() - MONTHS_18_MS).toISOString();

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Exa search failed (${res.status}).`);
  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    publishedDate: r.publishedDate,
    author: r.author ?? undefined,
    summary: typeof r.summary === "string" ? r.summary : undefined,
    highlights: r.highlights,
  }));
}
