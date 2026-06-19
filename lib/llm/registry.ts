/**
 * LLM provider registry. Claude is active; other providers can register with
 * the same LlmProvider shape later. The pipeline asks for "the active provider"
 * so phases never hard-code which model runs them.
 */

import { LlmProvider, LlmProviderInfo } from "./types";
import { anthropicProvider } from "./anthropic";
import { mockProvider } from "./mock";

/** Demo mode (MOCK_LLM=1): every phase runs on canned/sample outputs, no key needed. */
function mockMode(): boolean {
  return !!process.env.MOCK_LLM;
}

export const PROVIDERS: LlmProvider[] = [anthropicProvider];

/** The provider phases use by default. */
export function activeProvider(): LlmProvider {
  return mockMode() ? mockProvider : anthropicProvider;
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
