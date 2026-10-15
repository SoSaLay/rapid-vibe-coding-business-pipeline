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
  /** Expected runs per month (the default for the cost estimate; the user can change it). */
  runs_per_month?: number;
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

/** Which model-provider key the generated agent needs at run time. */
export function modelKeyEnv(modelId: string): string {
  return modelId.startsWith("openai:") ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
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
  return out;
}
