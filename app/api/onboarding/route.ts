import { NextResponse } from "next/server";
import { listProviderInfo } from "@/lib/llm/registry";
import { isExaConfigured } from "@/lib/exa";
import { isGoogleConfigured } from "@/lib/google/genai";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isGithubConfigured } from "@/lib/github/import";

/**
 * Aggregate connection status for the onboarding panel.
 * `requiredComplete` gates pipeline progression — only the LLM engine (Anthropic)
 * is required; the rest are optional and unlock extra phases when connected.
 */
export async function GET() {
  const providers = await listProviderInfo();
  const anthropic = !!providers.find((p) => p.id === "ai-anthropic")?.configured;
  const [exa, google, supabase, github] = await Promise.all([
    isExaConfigured(),
    isGoogleConfigured(),
    isSupabaseConfigured(),
    isGithubConfigured(),
  ]);
  return NextResponse.json({
    anthropic,
    exa,
    google,
    supabase,
    github,
    // requiredComplete gates progression (LLM engine only); allComplete = every key in.
    requiredComplete: anthropic,
    allComplete: anthropic && exa && google && supabase && github,
  });
}
