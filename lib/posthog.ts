/**
 * PostHog integration — product analytics for the things the pipeline SHIPS
 * (landing pages first, built apps later), never for the orchestrator itself.
 *
 * Two keys, two jobs — PostHog issues both and they are not interchangeable:
 *  - `projectApiKey` (phc_…) is PUBLIC. It goes into the browser on the pages we
 *    generate and only ever writes (ingestion). Safe to bake into HTML.
 *  - `personalApiKey` (phx_…) is PRIVATE and server-side only. It READS stats
 *    back out via the query API — the key that lets Phase 10 (ops checks) and
 *    Phase 11 (check-in signals) pull real numbers instead of asking the founder
 *    to type them from memory. Optional: without it, ingestion still works.
 *
 * Hosts: PostHog serves ingestion, app/API, and static assets on three related
 * origins. We store the ingestion host (what the founder is shown in-product)
 * and derive the other two, so self-hosted installs — where all three are the
 * same origin — work with no extra questions.
 */

import { readConnectorConfig, saveConnectorConfig } from "./connectors/config";

const ID = "posthog";

export const POSTHOG_US_HOST = "https://us.i.posthog.com";
export const POSTHOG_EU_HOST = "https://eu.i.posthog.com";

export interface PostHogConfig {
  /** phc_… — public, browser-safe, write-only ingestion key. */
  projectApiKey: string;
  /** Ingestion host, e.g. https://us.i.posthog.com. */
  host: string;
  /** phx_… — private, server-side only. Unlocks reading stats back. */
  personalApiKey?: string;
}

/** Where posthog-js is served from. Cloud splits assets onto a CDN origin; self-hosted doesn't. */
export function assetHostFor(host: string): string {
  const h = host.replace(/\/+$/, "");
  if (h === POSTHOG_US_HOST) return "https://us-assets.i.posthog.com";
  if (h === POSTHOG_EU_HOST) return "https://eu-assets.i.posthog.com";
  return h;
}

/** Where the REST/query API lives (the `.i.` ingestion subdomain doesn't serve it). */
export function apiHostFor(host: string): string {
  const h = host.replace(/\/+$/, "");
  if (h === POSTHOG_US_HOST) return "https://us.posthog.com";
  if (h === POSTHOG_EU_HOST) return "https://eu.posthog.com";
  return h;
}

export async function getPostHogConfig(): Promise<PostHogConfig | null> {
  const c = await readConnectorConfig(ID);
  const projectApiKey = c?.projectApiKey || process.env.POSTHOG_PROJECT_API_KEY || "";
  const host = c?.host || process.env.POSTHOG_HOST || POSTHOG_US_HOST;
  const personalApiKey = c?.personalApiKey || process.env.POSTHOG_PERSONAL_API_KEY || "";
  if (!projectApiKey) return null;
  return {
    projectApiKey,
    host: host.replace(/\/+$/, ""),
    personalApiKey: personalApiKey || undefined,
  };
}

export async function isPostHogConfigured(): Promise<boolean> {
  return !!(await getPostHogConfig());
}

/**
 * Everything the generated landing page needs — and nothing it shouldn't have.
 * The personal key is deliberately not part of this shape: it must never reach
 * a browser bundle, and keeping it out of the type makes that a compile error
 * rather than a code-review catch.
 */
export interface PostHogWebConfig {
  projectApiKey: string;
  host: string;
  assetHost: string;
}

export async function getPostHogWebConfig(): Promise<PostHogWebConfig | null> {
  const cfg = await getPostHogConfig();
  if (!cfg) return null;
  return { projectApiKey: cfg.projectApiKey, host: cfg.host, assetHost: assetHostFor(cfg.host) };
}

export async function configurePostHog(input: {
  projectApiKey: string;
  host?: string;
  personalApiKey?: string;
}): Promise<{ ok: boolean; error?: string; readAccess?: boolean }> {
  const projectApiKey = (input.projectApiKey || "").trim();
  const host = (input.host || POSTHOG_US_HOST).trim().replace(/\/+$/, "");
  const personalApiKey = (input.personalApiKey || "").trim();

  if (!projectApiKey) return { ok: false, error: "Missing PostHog project API key." };
  if (!/^phc_/.test(projectApiKey)) {
    return { ok: false, error: "That doesn't look like a project API key — it should start with 'phc_'." };
  }
  if (!/^https?:\/\//.test(host)) return { ok: false, error: "Host must start with https://" };

  // Verify the project key against PostHog's remote-config endpoint — the same
  // one posthog-js hits on load. Read-only and emits no event, so validating
  // never pollutes the founder's own analytics.
  //
  // An unknown token 404s here (not 401), and the single most likely cause of
  // that is a region mismatch: an EU project key checked against the US host
  // looks exactly like a bad key. The message says so, because otherwise the
  // founder retypes a perfectly good key over and over.
  try {
    const res = await fetch(`${host}/array/${encodeURIComponent(projectApiKey)}/config.js`, { method: "GET" });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        error: `PostHog at ${host} doesn't recognize that project API key. Check the key, and check the host matches your project's region (US vs EU).`,
      };
    }
  } catch {
    return { ok: false, error: `Could not reach ${host}. Check the host and your connection.` };
  }

  // The personal key is optional — but if one was pasted, prove it works now
  // rather than failing later inside a phase that expected to read stats.
  let readAccess = false;
  if (personalApiKey) {
    if (!/^phx_/.test(personalApiKey)) {
      return { ok: false, error: "That doesn't look like a personal API key — it should start with 'phx_'." };
    }
    try {
      const res = await fetch(`${apiHostFor(host)}/api/projects/`, {
        headers: { Authorization: `Bearer ${personalApiKey}` },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "PostHog rejected the personal API key (check its scopes include project read)." };
      }
      readAccess = res.ok;
    } catch {
      return { ok: false, error: `Could not reach ${apiHostFor(host)} to verify the personal API key.` };
    }
  }

  const stored: Record<string, string> = { projectApiKey, host };
  if (personalApiKey) stored.personalApiKey = personalApiKey;
  await saveConnectorConfig(ID, stored);
  return { ok: true, readAccess };
}
