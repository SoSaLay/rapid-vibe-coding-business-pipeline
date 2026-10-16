/**
 * The coding model: which model writes code in Engineering & Development (the
 * agent's tool bodies, the app's task graph). Chosen separately from the AI
 * engine in the toolbox; unset = the active engine with its default model.
 *
 * Stored at data/connectors/coding-model.json as { model }. The engine is read
 * from the model id (claude-* → Claude, anything else → OpenAI), and must be connected.
 */

import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";
import { activeProvider, getProvider } from "./registry";
import type { LlmCompleteJsonArgs } from "./types";

const ID = "coding-model";

export function engineFor(model: string): "ai-anthropic" | "ai-openai" {
  return /^claude/i.test(model) ? "ai-anthropic" : "ai-openai";
}

export async function getCodingModel(): Promise<string | null> {
  return (await readConnectorConfig(ID))?.model || null;
}

export async function setCodingModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const m = model.trim();
  if (!m) {
    await saveConnectorConfig(ID, {});
    return { ok: true };
  }
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(m)) return { ok: false, error: "That doesn't look like a model id." };
  const provider = getProvider(engineFor(m));
  if (!provider || !(await provider.isConfigured())) {
    return { ok: false, error: `Connect ${engineFor(m) === "ai-anthropic" ? "Claude" : "OpenAI"} under AI engine first.` };
  }
  await saveConnectorConfig(ID, { model: m });
  return { ok: true };
}

/** completeJson on the coding model (falls back to the active engine). */
export async function completeCodeJson<T>(args: LlmCompleteJsonArgs): Promise<T> {
  const model = await getCodingModel();
  if (model) {
    const provider = getProvider(engineFor(model));
    if (provider && (await provider.isConfigured())) return provider.completeJson<T>({ ...args, model });
  }
  return activeProvider().completeJson<T>(args);
}
