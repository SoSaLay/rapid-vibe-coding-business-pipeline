/**
 * The `agent-design` artifact — framework-neutral. Tool inputs are plain fields
 * (rendered to JSON Schema / Pydantic by the framework adapter), so swapping
 * LangChain for something else never changes this shape.
 */

export interface Field {
  name: string;
  type: "string" | "number" | "boolean" | "list" | "object";
  description: string;
  required: boolean;
}

/** One pick with the recommendation first and the alternatives the user may switch to. */
export interface Choice<T extends string = string> {
  selected: T;
  recommended: T;
  rationale: string;
  options: { id: T; label: string; tradeoff: string }[];
}

export interface ToolContract {
  name: string;
  description: string;
  /** "integration" = an existing LangChain integration; "custom" = code we write. */
  kind: "integration" | "custom";
  integration: string;
  side_effect: "read" | "write";
  permission: string;
  requires_approval: boolean;
  /** Env var the tool reads its credential from; "" when it needs none. */
  credential_env: string;
  credential_label: string;
  inputs: Field[];
  output: string;
  /** Turned off by the user in Agent Design — kept so they can turn it back on. */
  enabled: boolean;
}

export interface DataSource {
  name: string;
  kind: string;
  access: "read" | "read-write";
  why: string;
}

/** A skill: a SKILL.md the agent opens only when the task calls for it (progressive disclosure). */
export interface SkillDef {
  /** kebab-case folder name. */
  name: string;
  /** What it's for and when to use it — the only part the agent reads up front. */
  description: string;
  /** UI only: one everyday sentence framed as a routine ("Every time…, it…"). Missing = filled by plainSkillSummaries(). */
  plain?: string;
  /** The SKILL.md body: plain-English steps and the knowledge the job needs. */
  instructions: string;
  source: "recommended" | "written" | "imported";
  source_url?: string;
  enabled: boolean;
  /** Imported skills: what the security review flagged, and whether the owner signed off. */
  review?: { flags: string[]; approved: boolean };
}

export type KnowledgeMode = "none" | "skills" | "rag";

/** An MCP server whose tools the agent can use (loaded when the agent starts). */
export interface McpServer {
  /** Short id, e.g. "notion". */
  name: string;
  /** "http" = a remote server URL (streamable HTTP); "stdio" = a local command. */
  transport: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  /** Env var holding a bearer token for the server ("" = none). */
  token_env: string;
  /** Pause for your approval before any of its tools run (recommended: unknown tools can change things). */
  approval: boolean;
  /** Only these tools (empty = all the server offers). */
  allow: string[];
}

export interface MemoryConfig {
  /** Follow-up messages continue the same conversation (LangGraph checkpoints). */
  conversation: boolean;
  /** Durable facts about each user, saved by the agent with its remember tool. */
  user_profile: { enabled: boolean; what: string[] };
  /** Recent past conversations with the same user, shown to the agent at the start of a new one. */
  past_conversations: { enabled: boolean; days: number; items: number };
}

export interface ToolLimit {
  /** Most calls to this tool in one run. */
  max_calls: number;
  /** Retries after an error (reads only by default: a retried write could happen twice). */
  retries: number;
  /** Seconds before a call is abandoned. */
  timeout_s: number;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: "url" | "text";
  /** The URL, or the pasted text. */
  ref: string;
}

export interface AgentDesign {
  summary: string;
  approach: Choice<"agent" | "workflow">;
  model: Choice;
  memory: Choice<"none" | "conversation" | "long-term">;
  retrieval: { enabled: boolean; rationale: string };
  inputs: Field[];
  outputs: Field[];
  tools: ToolContract[];
  data_sources: DataSource[];
  step_limit: number;
  fallback: string;
  /** Stage 1 allowed actions → the tool that covers each ("" = uncovered). */
  coverage: { action: string; tool: string }[];
  est_cost_per_run: string;
  est_latency: string;
  /** Memory settings (replaces the single memory choice). Missing = derived from `memory` by effectiveMemory(). */
  memory_config?: MemoryConfig;
  /** Per-tool limits. Missing tools fall back to defaultToolLimit(). */
  tool_limits?: Record<string, ToolLimit>;
  /** MCP servers the agent can use tools from. */
  mcp_servers?: McpServer[];
  /** Skills the agent can open on demand. Missing on designs made before skills existed. */
  skills?: SkillDef[];
  /** ONE knowledge approach: none, facts written into skills, or document search (RAG, needs an OpenAI key for embeddings). */
  knowledge?: { mode: KnowledgeMode; sources: KnowledgeSource[] };
  /** Custom models: optional OpenAI-compatible endpoint and per-million-token prices (for cost numbers). */
  model_endpoint?: string;
  model_price?: { input: number; output: number };
  /** Expected runs per month (the default for the cost estimate; the user can change it). */
  runs_per_month?: number;
  /** Days to keep hand-off records before deleting them (set by a safety fix for personal data). Missing = keep. */
  retention_days?: number;
  /** Who can use it and how they log in. Missing on designs made before this existed. */
  login?: Choice<LoginId>;
}

export type LoginId = "machine-key" | "supabase-auth" | "neon-auth" | "clerk";

/**
 * The login rule (owner, 2026-10-14): nobody talks to it → machine key; people use it but
 * aren't charged → the state database's own login (Supabase Auth); sold to users → Clerk
 * (login + payments in one account).
 */
export function recommendLogin(agent: { people_use_it?: boolean; charges_users?: boolean } | undefined): Choice<LoginId> {
  const recommended: LoginId = agent?.charges_users ? "clerk" : agent?.people_use_it === false ? "machine-key" : "supabase-auth";
  const rationale =
    recommended === "clerk"
      ? "You plan to charge users, and Clerk handles login and payments in one account."
      : recommended === "machine-key"
        ? "Nobody talks to this agent, so there's nothing to log in to. It's called with a private machine-to-machine key."
        : "People use it but aren't charged, so the login that comes with the Supabase state database keeps it to one account.";
  return {
    selected: recommended,
    recommended,
    rationale,
    options: [
      { id: "machine-key", label: "No login (machine key only)", tradeoff: "For agents that run on their own; no chat page." },
      { id: "supabase-auth", label: "Supabase Auth", tradeoff: "Free, same account as the state database; data isolated per user." },
      { id: "neon-auth", label: "Neon Auth", tradeoff: "Same idea, if the state database is Neon." },
      { id: "clerk", label: "Clerk", tradeoff: "Login and payments together; best when you charge users." },
    ],
  };
}

/** Models the design may pick from. `id` is LangChain's "provider:model" string. */
export const AGENT_MODELS: { id: string; label: string; tier: string; note: string }[] = [
  { id: "anthropic:claude-opus-5-5", label: "Claude Opus 5.5", tier: "$$$ · slower", note: "Hardest reasoning and long multi-step tool use." },
  { id: "anthropic:claude-sonnet-5-5", label: "Claude Sonnet 5.5", tier: "$$ · fast", note: "Best default for most agents: strong tool use at a mid price." },
  { id: "anthropic:claude-haiku-5-5", label: "Claude Haiku 5.5", tier: "$ · fastest", note: "High-volume, simple, rule-shaped tasks." },
  { id: "openai:gpt-5", label: "GPT-5", tier: "$$ · fast", note: "OpenAI alternative for general tool use." },
  { id: "openai:gpt-5-mini", label: "GPT-5 mini", tier: "$ · fastest", note: "OpenAI budget option for simple tasks." },
];

/**
 * The cheaper model a practice test run uses instead of the agent's own (null = none: it already is the
 * cheap one, or it's a custom model/endpoint). Practice runs are opt-in; real checks use the agent's model.
 */
export function practiceModel(selected: string, endpoint?: string): string | null {
  if (endpoint) return null;
  if (selected.startsWith("anthropic:") && selected !== "anthropic:claude-haiku-5-5") return "anthropic:claude-haiku-5-5";
  if (selected === "openai:gpt-5") return "openai:gpt-5-mini";
  return null;
}

/**
 * LangChain providers a custom model can use ("provider:model"): the pip package and the key it reads.
 * "openai" also covers any OpenAI-compatible endpoint (set a custom endpoint URL).
 */
export const MODEL_PROVIDERS: Record<string, { pkg: string; env: string; label: string }> = {
  anthropic: { pkg: "langchain-anthropic>=1.0", env: "ANTHROPIC_API_KEY", label: "Anthropic" },
  openai: { pkg: "langchain-openai>=1.0", env: "OPENAI_API_KEY", label: "OpenAI or OpenAI-compatible" },
  google_genai: { pkg: "langchain-google-genai>=2.0", env: "GOOGLE_API_KEY", label: "Google Gemini" },
  mistralai: { pkg: "langchain-mistralai>=0.2", env: "MISTRAL_API_KEY", label: "Mistral" },
  groq: { pkg: "langchain-groq>=0.3", env: "GROQ_API_KEY", label: "Groq" },
  xai: { pkg: "langchain-xai>=0.2", env: "XAI_API_KEY", label: "xAI" },
  deepseek: { pkg: "langchain-deepseek>=0.1", env: "DEEPSEEK_API_KEY", label: "DeepSeek" },
  fireworks: { pkg: "langchain-fireworks>=0.3", env: "FIREWORKS_API_KEY", label: "Fireworks" },
  together: { pkg: "langchain-together>=0.3", env: "TOGETHER_API_KEY", label: "Together" },
  ollama: { pkg: "langchain-ollama>=0.3", env: "", label: "Ollama (local, no key)" },
};

export function modelProvider(modelId: string): string {
  return modelId.includes(":") ? modelId.split(":")[0] : "anthropic";
}

/** "provider:model" with a known provider and a sane model name. */
export function isValidModelId(modelId: string): boolean {
  const [p, m] = modelId.split(":");
  return !!MODEL_PROVIDERS[p] && /^[A-Za-z0-9._/@-]{2,120}$/.test(m ?? "");
}

/** Which model-provider key the generated agent needs at run time ("" = none). */
export function modelKeyEnv(modelId: string): string {
  return MODEL_PROVIDERS[modelProvider(modelId)]?.env ?? "ANTHROPIC_API_KEY";
}

export function modelPackage(modelId: string): string {
  return MODEL_PROVIDERS[modelProvider(modelId)]?.pkg ?? "langchain-anthropic>=1.0";
}

/** True when an allowed action maps to no tool (e.g. "leave it unlabeled"). */
export function needsNoTool(d: AgentDesign, toolName: string): boolean {
  return !d.tools.some((t) => t.name === toolName);
}

/** Approval check: what still blocks Approve design. Empty = ready. */
export function designBlockers(d: AgentDesign): string[] {
  const out: string[] = [];
  const tools = d.tools.filter((t) => t.enabled);
  if (d.approach.selected === "agent" && tools.length === 0) out.push("An agent needs at least one tool turned on.");
  for (const t of tools) {
    if (!t.permission.trim()) out.push(`Tool "${t.name}" has no permission set.`);
  }
  for (const c of d.coverage) {
    // Only a tool that exists but is turned off leaves an action uncovered; anything else means "no tool needed".
    const tool = d.tools.find((t) => t.name === c.tool);
    if (tool && !tool.enabled) out.push(`Allowed action "${c.action}" needs "${tool.name}", which is turned off.`);
  }
  if (!(d.step_limit > 0)) out.push("Set a step limit above 0.");
  for (const s of d.skills ?? []) {
    if (s.enabled && s.review && !s.review.approved) out.push(`Review the imported skill "${s.name}" before approving.`);
  }
  if (d.knowledge?.mode === "rag" && !d.knowledge.sources.length) out.push("Document search is on but has no documents. Add some, or pick another knowledge option.");
  for (const m of d.mcp_servers ?? []) {
    if (m.transport === "http" && !/^https?:\/\//.test(m.url ?? "")) out.push(`MCP server "${m.name}" needs an http(s) URL.`);
    if (m.transport === "stdio" && !(m.command ?? "").trim()) out.push(`MCP server "${m.name}" needs a command.`);
  }
  if (!isValidModelId(d.model.selected)) out.push("The custom model must be provider:model with a supported provider.");
  if (d.model_endpoint && !/^https?:\/\//.test(d.model_endpoint)) out.push("The custom endpoint must be an http(s) URL.");
  return out;
}

/** Memory as configured, or recommended from the older single choice. */
export function effectiveMemory(d: AgentDesign, agent?: { people_use_it?: boolean }): MemoryConfig {
  if (d.memory_config) return d.memory_config;
  const longTerm = d.memory?.selected === "long-term";
  return {
    conversation: d.memory?.selected !== "none" || agent?.people_use_it === true,
    user_profile: { enabled: longTerm, what: longTerm ? ["preferences", "how they like answers"] : [] },
    past_conversations: { enabled: longTerm, days: 30, items: 5 },
  };
}

/** Recommended per-tool limits: reads may retry and repeat a little; writes run once or twice, never retried. */
export function defaultToolLimit(t: ToolContract): ToolLimit {
  return t.side_effect === "write" ? { max_calls: 2, retries: 0, timeout_s: 30 } : { max_calls: 5, retries: 2, timeout_s: 30 };
}

export function effectiveLimits(d: AgentDesign): Record<string, ToolLimit> {
  const out: Record<string, ToolLimit> = {};
  for (const t of d.tools.filter((x) => x.enabled)) out[t.name] = { ...defaultToolLimit(t), ...(d.tool_limits?.[t.name] ?? {}) };
  return out;
}

/** When to stop, taken from Define the Job (not edited here). */
export function stopRules(spec: Record<string, any> | null | undefined, d: AgentDesign): string[] {
  const a = spec?.agent ?? {};
  const done = Array.isArray(a.success_criteria) ? a.success_criteria : [];
  const bad = Array.isArray(a.failure_criteria) ? a.failure_criteria : [];
  return [
    ...done.map((c: string) => `Done when: ${c}`),
    ...bad.map((c: string) => `Stop and hand off if: ${c}`),
    `Never take more than ${d.step_limit} steps; hand off to ${d.fallback || "a human"} instead.`,
    "Don't repeat a tool call with the same inputs; use what it returned, or hand off.",
  ];
}
