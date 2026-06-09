/**
 * Claude (Anthropic) provider — the primary AI engine.
 *
 * - Model: claude-opus-4-8 (latest, most capable)
 * - Adaptive thinking for the synthesis-grade reasoning a Product Owner needs
 * - Structured outputs (output_config.format) so questions/specs come back as
 *   schema-valid JSON — no brittle parsing
 * - Prompt caching on the stable system prompt (the volatile idea/dialogue lives
 *   in messages, after the cached prefix)
 *
 * The API key is pasted in-app and stored locally (data/connectors/ai-anthropic.json),
 * or read from ANTHROPIC_API_KEY — never hard-coded.
 */

import Anthropic from "@anthropic-ai/sdk";
import { LlmCompleteJsonArgs, LlmProvider } from "./types";
import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";

const ID = "ai-anthropic";
const MODEL = "claude-opus-4-8";

async function getApiKey(): Promise<string | null> {
  const config = await readConnectorConfig(ID);
  return config?.apiKey || process.env.ANTHROPIC_API_KEY || null;
}

async function getClient(): Promise<Anthropic | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export const anthropicProvider: LlmProvider = {
  id: ID,
  name: "Claude (Anthropic)",
  status: "active",

  async isConfigured() {
    return !!(await getApiKey());
  },

  async configure(credentials) {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) return { ok: false, error: "Missing API key." };
    try {
      const client = new Anthropic({ apiKey });
      await client.models.retrieve(MODEL); // cheap GET — validates the key
      await saveConnectorConfig(ID, { apiKey });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Invalid API key." };
    }
  },

  async completeJson<T>(args: LlmCompleteJsonArgs): Promise<T> {
    const client = await getClient();
    if (!client) throw new Error("Claude is not connected. Add your Anthropic API key.");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort: args.effort ?? "high",
        format: { type: "json_schema", schema: args.schema as any },
      },
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    } as any);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) throw new Error("No response from Claude.");
    return JSON.parse(textBlock.text) as T;
  },
};
