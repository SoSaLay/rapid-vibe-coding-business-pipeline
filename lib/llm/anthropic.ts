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

/**
 * Output budget scales with effort. Adaptive thinking spends tokens from this
 * same budget, so a flat 8k truncated large structured outputs (e.g. the design
 * spec) mid-JSON. Higher effort → more room for both thinking and the answer.
 */
const MAX_TOKENS_BY_EFFORT: Record<"low" | "medium" | "high", number> = {
  low: 4000,
  medium: 8000,
  high: 16000,
};

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

    const effort = args.effort ?? "high";

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_BY_EFFORT[effort],
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort,
        format: { type: "json_schema", schema: args.schema as any },
      },
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    } as any);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) throw new Error("No response from Claude.");

    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      // A truncated response (hit max_tokens mid-JSON) or any non-JSON payload
      // lands here. Surface a clean, actionable message instead of a raw
      // "Unexpected token / missing semicolon" syntax error.
      const truncated = (response as any).stop_reason === "max_tokens";
      throw new Error(
        truncated
          ? "The AI response was cut off before it finished. Please try again."
          : "The AI response couldn't be read. Please try again."
      );
    }
  },
};
