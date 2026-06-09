/**
 * LLM provider registry. Claude is active; other providers can register with
 * the same LlmProvider shape later. The pipeline asks for "the active provider"
 * so phases never hard-code which model runs them.
 */

import { LlmProvider, LlmProviderInfo } from "./types";
import { anthropicProvider } from "./anthropic";

export const PROVIDERS: LlmProvider[] = [anthropicProvider];

/** The provider phases use by default. */
export function activeProvider(): LlmProvider {
  return anthropicProvider;
}

export function getProvider(id: string): LlmProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export async function listProviderInfo(): Promise<LlmProviderInfo[]> {
  return Promise.all(
    PROVIDERS.map(async (p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      configured: await p.isConfigured(),
    }))
  );
}
