/** Per-million-token prices (USD) for cost-per-task metrics. Anthropic rates as of 2026-10; OpenAI rates are estimates. */
const PRICES: Record<string, { input: number; output: number }> = {
  "anthropic:claude-opus-5-5": { input: 4, output: 20 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "openai:gpt-5": { input: 1.25, output: 10 },
  "openai:gpt-5-mini": { input: 0.25, output: 2 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Parse a budget like "< $0.05 per email" → 0.05, "< 1 min" → 60 (seconds). Null when unparseable. */
export function parseCostBudget(text?: string): number | null {
  const m = /\$\s*([\d.]+)/.exec(text ?? "") || /([\d.]+)\s*(?:cents?|¢)/i.exec(text ?? "");
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /cents?|¢/i.test(m[0]) ? n / 100 : n;
}

export function parseLatencyBudget(text?: string): number | null {
  const m = /([\d.]+)\s*(ms|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hours?)\b/i.exec(text ?? "");
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u.startsWith("ms") || u.startsWith("milli")) return n / 1000;
  if (u === "m" || u.startsWith("min")) return n * 60;
  if (u.startsWith("h")) return n * 3600;
  return n;
}
