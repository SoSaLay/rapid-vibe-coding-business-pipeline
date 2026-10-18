import { NextResponse } from "next/server";
import { listProviderInfo, getActiveProviderId } from "@/lib/llm/registry";
import { isExaConfigured } from "@/lib/exa";
import { isGoogleConfigured } from "@/lib/google/genai";
import { isSupabaseConfigured } from "@/lib/supabase";
import { activeEmailProvider } from "@/lib/email/registry";
import { isPostHogConfigured } from "@/lib/posthog";
import { langfuseConfig, langsmithKey } from "@/lib/agent/registry";
import { readConnectorConfig } from "@/lib/connectors/config";

/**
 * Aggregate connection status for the onboarding panel.
 * `requiredComplete` gates pipeline progression — only the LLM engine (Anthropic)
 * is required; the rest are optional and unlock extra phases when connected.
 * GitHub import is configured ad-hoc in the Business Owner phase, not here.
 */
export async function GET() {
  const providers = await listProviderInfo();
  const anthropic = !!providers.find((p) => p.id === "ai-anthropic")?.configured;
  const openai = !!providers.find((p) => p.id === "ai-openai")?.configured;
  const [langfuse, langsmith, aws, railway] = await Promise.all([
    langfuseConfig().then(Boolean),
    langsmithKey().then(Boolean),
    readConnectorConfig("aws").then((c) => !!(c?.profile || c?.accessKeyId)),
    readConnectorConfig("railway").then((c) => !!c?.productionToken),
  ]);
  const [exa, google, supabase, resend, posthog] = await Promise.all([
    isExaConfigured(),
    isGoogleConfigured(),
    isSupabaseConfigured(),
    activeEmailProvider().isConfigured(),
    isPostHogConfigured(),
  ]);
  // The "AI engine" slot is satisfied by EITHER Claude or OpenAI.
  const llm = anthropic || openai;
  const activeLlm = getActiveProviderId() || (anthropic ? "ai-anthropic" : openai ? "ai-openai" : "ai-anthropic");
  return NextResponse.json({
    anthropic,
    openai,
    activeLlm,
    exa,
    google,
    supabase,
    resend,
    posthog,
    langfuse,
    langsmith,
    aws,
    railway,
    // requiredComplete gates progression (any LLM engine); allComplete = every slot in.
    requiredComplete: llm,
    allComplete: llm && exa && google && supabase && resend && posthog,
  });
}
