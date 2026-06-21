/**
 * LLM provider registry. Claude is the recommended default; OpenAI is wired as
 * an interchangeable alternative. Phases ask for "the active provider" so they
 * never hard-code which model runs them.
 *
 * The active engine is the user's stored choice (data/connectors/ai-active.json,
 * set when they connect a provider or pick one in onboarding). activeProvider()
 * is synchronous — called from ~25 phase call sites — so the preference is read
 * with a synchronous file read and falls back to Claude.
 */

import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { LlmProvider, LlmProviderInfo } from "./types";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { mockProvider } from "./mock";

const ACTIVE_FILE = path.join(process.cwd(), "data", "connectors", "ai-active.json");

/** Demo mode (MOCK_LLM=1): every phase runs on canned/sample outputs, no key needed. */
function mockMode(): boolean {
  return !!process.env.MOCK_LLM;
}

export const PROVIDERS: LlmProvider[] = [anthropicProvider, openaiProvider];

/** Read the stored active-engine id synchronously (null if unset). */
export function getActiveProviderId(): string | null {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE, "utf8");
    return (JSON.parse(raw)?.provider as string) || null;
  } catch {
    return null;
  }
}

/** Persist which engine the pipeline should use. */
export async function setActiveProvider(id: string): Promise<void> {
  await fsp.mkdir(path.dirname(ACTIVE_FILE), { recursive: true });
  await fsp.writeFile(ACTIVE_FILE, JSON.stringify({ provider: id }, null, 2), "utf8");
}

/** The provider phases use. Honors the stored choice; defaults to Claude. */
export function activeProvider(): LlmProvider {
  if (mockMode()) return mockProvider;
  const id = getActiveProviderId();
  const chosen = id ? PROVIDERS.find((p) => p.id === id) : undefined;
  return chosen ?? anthropicProvider;
}

export function getProvider(id: string): LlmProvider | undefined {
  if (mockMode()) return mockProvider;
  return PROVIDERS.find((p) => p.id === id);
}

export async function listProviderInfo(): Promise<LlmProviderInfo[]> {
  const providers = mockMode() ? [mockProvider] : PROVIDERS;
  return Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      configured: await p.isConfigured(),
    }))
  );
}
