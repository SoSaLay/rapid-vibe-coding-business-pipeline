/**
 * Generic LLM provider contract — mirrors the connector pattern so the AI
 * engine behind any phase is swappable. Claude is the primary, fully-wired
 * provider; others can register with the same shape later.
 */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteJsonArgs {
  system: string;
  messages: LlmMessage[];
  /** JSON Schema the response must conform to (structured output). */
  schema: Record<string, unknown>;
  /** Reasoning depth / cost tradeoff. */
  effort?: "low" | "medium" | "high";
}

export interface LlmProvider {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  isConfigured(): Promise<boolean>;
  configure(credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  /** Returns parsed JSON guaranteed to match the schema. */
  completeJson<T>(args: LlmCompleteJsonArgs): Promise<T>;
}

export interface LlmProviderInfo {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  configured: boolean;
}
