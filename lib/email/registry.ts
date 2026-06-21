/**
 * Email-provider registry. Resend is the active, fully-wired provider; the
 * others ship as identical-shape "coming_soon" stubs so cloning Resend's
 * behavior onto them later is near-zero rework (same pattern as lib/llm and
 * lib/connectors). The pipeline asks for "the active email provider" so the
 * broadcast hub never hard-codes which service sends.
 */

import { EmailProvider, EmailProviderInfo } from "./types";
import { resendProvider } from "./resend";

function comingSoon(id: string, name: string): EmailProvider {
  const notReady = async () => {
    throw new Error(`${name} email provider is not implemented yet.`);
  };
  return {
    id,
    name,
    status: "coming_soon",
    async isConfigured() {
      return false;
    },
    async configure() {
      return { ok: false, error: `${name} email provider is not implemented yet.` };
    },
    async sendEmail() {
      return { ok: false, error: `${name} is not implemented yet.` };
    },
    ensureAudience: notReady,
    async syncContacts() {
      return 0;
    },
    createBroadcast: notReady,
    async sendBroadcast() {
      return { ok: false, error: `${name} is not implemented yet.` };
    },
    getBroadcast: notReady,
    async defaultFrom() {
      return "";
    },
  };
}

export const EMAIL_PROVIDERS: EmailProvider[] = [
  resendProvider,
  comingSoon("loops", "Loops"),
  comingSoon("postmark", "Postmark"),
];

/** The email provider the broadcast hub uses. Resend is the only active one today. */
export function activeEmailProvider(): EmailProvider {
  return resendProvider;
}

export function getEmailProvider(id: string): EmailProvider | undefined {
  return EMAIL_PROVIDERS.find((p) => p.id === id);
}

export async function listEmailProviderInfo(): Promise<EmailProviderInfo[]> {
  return Promise.all(
    EMAIL_PROVIDERS.map(async (p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      configured: p.status === "active" ? await p.isConfigured() : false,
    }))
  );
}
