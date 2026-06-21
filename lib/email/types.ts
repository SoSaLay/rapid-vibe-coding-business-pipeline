/**
 * Generic email-provider contract — mirrors the LLM/connector pattern so the
 * email engine behind the broadcast hub is swappable. Resend is the primary,
 * fully-wired provider; others can register with the same shape later.
 *
 * This is an ORCHESTRATOR-side tool: the founder's key, used by the pipeline to
 * send broadcasts on their behalf. It is deliberately a manual broadcast hub —
 * waitlist updates, launch announcements, product/feature notifications, and
 * marketing campaigns are all one umbrella (a broadcast the founder composes and
 * sends), NOT automated event-driven email. Auth/billing email stays with
 * Clerk/Stripe in the apps the pipeline builds.
 */

export interface EmailContact {
  email: string;
  firstName?: string;
}

export interface SendEmailArgs {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
}

export interface CreateBroadcastArgs {
  audienceId: string;
  from: string;
  subject: string;
  html: string;
}

/** Open/click/delivery stats for a sent broadcast (best-effort; provider-shaped). */
export interface BroadcastStats {
  id: string;
  status: string;
  /** Raw counts when the provider exposes them; absent until the send settles. */
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  bounced?: number;
}

export interface EmailProvider {
  id: string;
  name: string;
  status: "active" | "coming_soon";

  isConfigured(): Promise<boolean>;
  configure(credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }>;

  /** One-off send — used for the "send a test to myself" button. */
  sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; id?: string; error?: string }>;

  /** Find-or-create an audience by name; returns its id. */
  ensureAudience(name: string): Promise<string>;
  /** Upsert contacts into an audience (idempotent on email). Returns how many were synced. */
  syncContacts(audienceId: string, contacts: EmailContact[]): Promise<number>;

  /** Compose a broadcast against an audience; returns its id (not yet sent). */
  createBroadcast(args: CreateBroadcastArgs): Promise<string>;
  /** Send a previously created broadcast. */
  sendBroadcast(broadcastId: string): Promise<{ ok: boolean; error?: string }>;
  /** Poll a broadcast's status + stats for the dashboard. */
  getBroadcast(broadcastId: string): Promise<BroadcastStats>;

  /** The default sender address (verified domain, or Resend's test address). */
  defaultFrom(): Promise<string>;
}

export interface EmailProviderInfo {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  configured: boolean;
}
