/**
 * OpenAI (ChatGPT) provider — an alternative AI engine to Claude.
 *
 * Implements the same LlmProvider contract as anthropic.ts so any phase can run
 * on it interchangeably. Claude remains the recommended default; this lets a
 * user paste an OpenAI key instead and drive the whole pipeline with GPT.
 *
 * - Structured outputs via Chat Completions `response_format: json_schema`
 *   (strict). The pipeline's schemas were written for Anthropic, so we sanitize
 *   them into OpenAI's strict shape at call time (every object closed +
 *   all-properties-required) so any phase schema works unchanged.
 * - Model is OPENAI_MODEL or a current default; effort maps to reasoning_effort
 *   only when a reasoning-capable model is selected.
 *
 * Key is pasted in-app and stored locally (data/connectors/ai-openai.json) or
 * read from OPENAI_API_KEY — never hard-coded. REST via fetch, no SDK.
 */

import { LlmCompleteJsonArgs, LlmProvider } from "./types";
import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";

const ID = "ai-openai";
const API_ROOT = "https://api.openai.com/v1";
/** OpenAI's current recommended default ("start with gpt-5.5"); override with OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-5.5";

function model(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

async function getApiKey(): Promise<string | null> {
  const config = await readConnectorConfig(ID);
  return config?.apiKey || process.env.OPENAI_API_KEY || null;
}

/**
 * Rewrite a JSON schema into OpenAI strict-mode shape: every object node gets
 * additionalProperties:false and required = all its property keys. Our schemas
 * already lean this way for Anthropic; this guarantees compatibility for any
 * that don't.
 */
function toStrictSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) out[k] = toStrictSchema(v);
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties);
    }
    return out;
  }
  return node;
}

export const openaiProvider: LlmProvider = {
  id: ID,
  name: "OpenAI (ChatGPT)",
  status: "active",

  async isConfigured() {
    return !!(await getApiKey());
  },

  async configure(credentials) {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) return { ok: false, error: "Missing API key." };
    try {
      const res = await fetch(`${API_ROOT}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (res.status === 401) return { ok: false, error: "Invalid OpenAI API key." };
      if (!res.ok) return { ok: false, error: `OpenAI error ${res.status}.` };
      await saveConnectorConfig(ID, { apiKey });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Could not reach OpenAI." };
    }
  },

  async completeJson<T>(args: LlmCompleteJsonArgs): Promise<T> {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("OpenAI is not connected. Add your OpenAI API key.");

    const res = await fetch(`${API_ROOT}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model(),
        messages: [
          { role: "system", content: args.system },
          ...args.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "result", strict: true, schema: toStrictSchema(args.schema) },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from OpenAI.");
    return JSON.parse(content) as T;
  },
};
