/**
 * Resend email provider — REST via fetch, no SDK (same approach as the Google
 * and Supabase clients). The founder's API key is pasted in-app and stored at
 * data/connectors/resend.json (gitignored). One key; the pipeline sends on the
 * founder's behalf.
 *
 * Endpoints used (https://resend.com/docs):
 *   POST   /emails                      one-off send (test)
 *   GET    /audiences                   list audiences (find-or-create)
 *   POST   /audiences                   create audience
 *   POST   /audiences/{id}/contacts     upsert a contact
 *   POST   /broadcasts                  compose a broadcast
 *   POST   /broadcasts/{id}/send        send it
 *   GET    /broadcasts/{id}             status + stats
 */

import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";
import {
  BroadcastStats,
  CreateBroadcastArgs,
  EmailContact,
  EmailProvider,
  SendEmailArgs,
} from "./types";

const ID = "resend";
const API_ROOT = "https://api.resend.com";
/** Resend's shared test sender — works before the founder verifies a domain. */
export const RESEND_TEST_FROM = "Acme <onboarding@resend.dev>";

async function getConfig(): Promise<{ apiKey: string; fromAddress?: string } | null> {
  const c = await readConnectorConfig(ID);
  const apiKey = c?.apiKey || process.env.RESEND_API_KEY || "";
  if (!apiKey) return null;
  return { apiKey, fromAddress: c?.fromAddress };
}

async function getApiKey(): Promise<string | null> {
  return (await getConfig())?.apiKey ?? null;
}

/** Authenticated JSON request. Returns { ok, status, data }. Never throws on HTTP errors. */
async function req(
  key: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const resendProvider: EmailProvider = {
  id: "resend",
  name: "Resend",
  status: "active",

  async isConfigured() {
    return !!(await getApiKey());
  },

  /** Validate + persist the key. A cheap GET /audiences confirms it's real. */
  async configure(credentials: Record<string, string>) {
    const apiKey = (credentials.apiKey || "").trim();
    if (!apiKey) return { ok: false, error: "Missing Resend API key." };
    try {
      const r = await req(apiKey, "GET", "/audiences");
      // A valid key returns 200 (or 404 when no audiences exist). 400/401/403 = bad key.
      if ([400, 401, 403].includes(r.status)) {
        return { ok: false, error: r.data?.message || "Invalid Resend API key." };
      }
      if (!r.ok && r.status !== 404) return { ok: false, error: `Resend error ${r.status}.` };
      const fromAddress = (credentials.fromAddress || "").trim();
      await saveConnectorConfig(ID, { apiKey, ...(fromAddress ? { fromAddress } : {}) });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Could not reach Resend." };
    }
  },

  async defaultFrom() {
    return (await getConfig())?.fromAddress || RESEND_TEST_FROM;
  },

  async sendEmail(args: SendEmailArgs) {
    const key = await getApiKey();
    if (!key) return { ok: false, error: "Resend is not connected." };
    const r = await req(key, "POST", "/emails", {
      from: args.from,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html: args.html,
    });
    if (!r.ok) return { ok: false, error: r.data?.message || `Send failed (${r.status}).` };
    return { ok: true, id: r.data?.id };
  },

  async ensureAudience(name: string) {
    const key = await getApiKey();
    if (!key) throw new Error("Resend is not connected.");
    const list = await req(key, "GET", "/audiences");
    const existing: any[] = list.data?.data || [];
    const found = existing.find((a) => a.name === name);
    if (found?.id) return found.id as string;
    const created = await req(key, "POST", "/audiences", { name });
    if (!created.ok || !created.data?.id) {
      throw new Error(created.data?.message || `Could not create audience (${created.status}).`);
    }
    return created.data.id as string;
  },

  async syncContacts(audienceId: string, contacts: EmailContact[]) {
    const key = await getApiKey();
    if (!key) throw new Error("Resend is not connected.");
    let synced = 0;
    for (const c of contacts) {
      if (!c.email) continue;
      const r = await req(key, "POST", `/audiences/${audienceId}/contacts`, {
        email: c.email,
        ...(c.firstName ? { first_name: c.firstName } : {}),
        unsubscribed: false,
      });
      // 409/422 = already a contact → still counts as present in the audience.
      if (r.ok || r.status === 409 || r.status === 422) synced += 1;
    }
    return synced;
  },

  async createBroadcast(args: CreateBroadcastArgs) {
    const key = await getApiKey();
    if (!key) throw new Error("Resend is not connected.");
    const r = await req(key, "POST", "/broadcasts", {
      audience_id: args.audienceId,
      from: args.from,
      subject: args.subject,
      html: args.html,
    });
    if (!r.ok || !r.data?.id) throw new Error(r.data?.message || `Could not create broadcast (${r.status}).`);
    return r.data.id as string;
  },

  async sendBroadcast(broadcastId: string) {
    const key = await getApiKey();
    if (!key) return { ok: false, error: "Resend is not connected." };
    const r = await req(key, "POST", `/broadcasts/${broadcastId}/send`);
    if (!r.ok) return { ok: false, error: r.data?.message || `Send failed (${r.status}).` };
    return { ok: true };
  },

  async getBroadcast(broadcastId: string): Promise<BroadcastStats> {
    const key = await getApiKey();
    if (!key) throw new Error("Resend is not connected.");
    const r = await req(key, "GET", `/broadcasts/${broadcastId}`);
    if (!r.ok) throw new Error(r.data?.message || `Could not read broadcast (${r.status}).`);
    const d = r.data || {};
    return {
      id: d.id || broadcastId,
      status: d.status || "unknown",
      sent: d.sent ?? undefined,
      delivered: d.delivered ?? undefined,
      opened: d.opened ?? undefined,
      clicked: d.clicked ?? undefined,
      bounced: d.bounced ?? undefined,
    };
  },
};
