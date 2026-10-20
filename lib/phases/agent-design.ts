/**
 * Agent pipeline — stage 2: Agent Design.
 *
 * Turns the spec's `agent` block into a framework-neutral `agent-design`: every
 * decision comes back as a RECOMMENDATION with alternatives (model, workflow vs
 * agent, memory), plus the tool contracts, data sources and safety settings.
 * The user edits and approves it; Engineering then builds exactly that.
 */

import { activeProvider } from "../llm/registry";
import { SKIMMABLE_STYLE } from "./brevity";
import { AGENT_MODELS, AgentDesign, Choice, recommendLogin } from "../agent/design";
import { recommendSkills } from "../agent/skills";

const MODEL_IDS = AGENT_MODELS.map((m) => m.id);

const FIELD = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "snake_case" },
    type: { type: "string", enum: ["string", "number", "boolean", "list", "object"] },
    description: { type: "string", description: "≤15 words." },
    required: { type: "boolean" },
  },
  required: ["name", "type", "description", "required"],
};

function choiceSchema(ids: string[], what: string) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recommended: { type: "string", description: `One of: ${ids.join(", ")}` },
      rationale: { type: "string", description: `Why this ${what} fits THIS job. ONE sentence.` },
      options: {
        type: "array",
        description: `Every option (including the recommended one) with its tradeoff for THIS job.`,
        items: {
          type: "object",
          additionalProperties: false,
          properties: { id: { type: "string", description: `One of: ${ids.join(", ")}` }, tradeoff: { type: "string", description: "≤15 words." } },
          required: ["id", "tradeoff"],
        },
      },
    },
    required: ["recommended", "rationale", "options"],
  };
}

/** Call 1: the decisions, each a recommendation with alternatives. */
const DECISIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "What this agent does and how, in plain language. AT MOST 2 sentences." },
    approach: choiceSchema(["agent", "workflow"], "approach"),
    model: choiceSchema(MODEL_IDS, "model"),
    memory: choiceSchema(["none", "conversation", "long-term"], "memory setting"),
    retrieval: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", description: "Default false. True only if the job needs outside knowledge the model doesn't have." },
        rationale: { type: "string", description: "ONE sentence." },
      },
      required: ["enabled", "rationale"],
    },
    step_limit: { type: "integer", description: "Max model+tool turns per run. Usually 5-15." },
    fallback: { type: "string", description: "Who gets the task when the agent can't finish, and how. ONE sentence." },
    est_cost_per_run: { type: "string", description: "e.g. '~$0.02'." },
    est_latency: { type: "string", description: "e.g. '~10s'." },
    runs_per_month: { type: "integer", description: "Expected runs per month, inferred from how often the job happens (e.g. 40 emails/day ≈ 1200)." },
  },
  required: ["summary", "approach", "model", "memory", "retrieval", "step_limit", "fallback", "est_cost_per_run", "est_latency", "runs_per_month"],
};

/** Call 2: the contracts — tools, data, inputs/outputs, coverage. */
const CONTRACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    inputs: { type: "array", items: FIELD, description: "What one run receives." },
    outputs: { type: "array", items: FIELD, description: "The structured answer one run hands back." },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "snake_case verb_noun, e.g. read_inbox." },
          description: { type: "string", description: "What it does, for the model. ONE sentence." },
          kind: { type: "string", enum: ["integration", "custom"] },
          integration: { type: "string", description: "The LangChain integration or Python library it uses (e.g. 'langchain-google-community GmailToolkit'), or '' for pure custom code." },
          side_effect: { type: "string", enum: ["read", "write"] },
          permission: { type: "string", description: "The narrowest permission/scope it needs, e.g. 'gmail.readonly'." },
          requires_approval: { type: "boolean", description: "True for consequential or irreversible writes." },
          credential_env: { type: "string", description: "UPPER_SNAKE env var for its credential, or '' if none." },
          credential_label: { type: "string", description: "Plain-language name of that credential, e.g. 'Gmail API token', or ''." },
          inputs: { type: "array", items: FIELD },
          output: { type: "string", description: "What it returns. ≤15 words." },
        },
        required: ["name", "description", "kind", "integration", "side_effect", "permission", "requires_approval", "credential_env", "credential_label", "inputs", "output"],
      },
    },
    data_sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          kind: { type: "string", description: "e.g. 'email inbox', 'Google Sheet', 'REST API', 'CSV upload'." },
          access: { type: "string", enum: ["read", "read-write"] },
          why: { type: "string", description: "ONE sentence." },
        },
        required: ["name", "kind", "access", "why"],
      },
    },
    coverage: {
      type: "array",
      description: "One entry per allowed action from the spec, mapped to the tool name that performs it, or \"none\" when the action needs no tool (e.g. leaving something alone).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { action: { type: "string" }, tool: { type: "string" } },
        required: ["action", "tool"],
      },
    },
  },
  required: ["inputs", "outputs", "tools", "data_sources", "coverage"],
};

const SYSTEM = `You are a senior AI agent architect designing a production agent for a non-technical owner.
Design the SIMPLEST thing that reliably does the job, and recommend a choice for every decision.

- Workflow or agent: if the steps are fixed and known, recommend "workflow" (a deterministic sequence)
  and say so. Recommend "agent" only when the steps depend on what it finds.
- Model: default to Claude Sonnet 5.5. Go cheaper (Haiku, GPT-5 mini) when the job is simple and rule-shaped.
  Never recommend Opus: it costs about twice as much to run and to test; the owner can still pick it. Models:
${AGENT_MODELS.map((m) => `  - ${m.id} (${m.label}, ${m.tier}): ${m.note}`).join("\n")}
- Tools: one per capability the job needs, each with the NARROWEST permission. Every allowed action
  must map to a tool. Never design a tool for a forbidden action. Writes that are consequential or
  irreversible (sending, deleting, paying, posting) require human approval. Prefer an existing
  LangChain integration or a well-known Python library over custom code, and name it.
- Data sources: what the agent reads or writes, and why.
- Retrieval: off unless the job needs outside knowledge the model lacks.
- Memory: none unless runs genuinely build on earlier ones.
- Safety: a step limit, and a human fallback from the spec.

${SKIMMABLE_STYLE}`;

const LABELS: Record<string, string> = {
  agent: "Agent (decides its steps)",
  workflow: "Workflow (fixed steps)",
  none: "None (every run starts fresh)",
  conversation: "Per conversation",
  "long-term": "Long-term memory",
  ...Object.fromEntries(AGENT_MODELS.map((m) => [m.id, m.label])),
};

/** The model pick, with Sonnet as the default (and in place of Opus, which only the owner chooses). */
const DEFAULT_MODEL = "anthropic:claude-sonnet-5-5";
function modelChoice(raw: any): Choice<string> {
  const rec = MODEL_IDS.includes(raw?.recommended) && raw.recommended !== "anthropic:claude-opus-5-5" ? raw.recommended : DEFAULT_MODEL;
  return toChoice({ ...raw, recommended: rec }, MODEL_IDS);
}

function toChoice<T extends string>(raw: any, ids: T[]): Choice<T> {
  const recommended = (ids.includes(raw?.recommended) ? raw.recommended : ids[0]) as T;
  const byId = new Map<string, string>((raw?.options ?? []).map((o: any) => [o.id, o.tradeoff]));
  return {
    selected: recommended,
    recommended,
    rationale: raw?.rationale ?? "",
    options: ids.map((id) => ({ id, label: LABELS[id] ?? id, tradeoff: byId.get(id) ?? "" })),
  };
}

export function specToAgentText(spec: Record<string, any>): string {
  const a = spec.agent ?? {};
  const l = (v: any) => (Array.isArray(v) ? v.join("; ") : "");
  return [
    `Summary: ${spec.summary ?? ""}`,
    `Task: ${a.task ?? spec.problem_statement ?? ""}`,
    `Trigger: ${a.trigger ?? ""}`,
    `Users: ${l(a.users ?? spec.target_users)}`,
    `Success criteria: ${l(a.success_criteria ?? spec.success_metrics)}`,
    `Failure criteria: ${l(a.failure_criteria)}`,
    `Allowed actions: ${l(a.allowed_actions)}`,
    `Forbidden actions: ${l(a.forbidden_actions)}`,
    `Latency budget: ${a.latency_budget ?? ""} · Cost budget: ${a.cost_budget ?? ""} · Data sensitivity: ${a.data_sensitivity ?? ""}`,
    `Human fallback: ${a.human_fallback ?? ""}`,
    `Capabilities: ${(spec.must_have_features ?? []).map((f: any) => `${f.name}: ${f.description}`).join("; ")}`,
    `Example tasks:\n${(a.example_tasks ?? []).map((e: any, i: number) => `  ${i + 1}. ${e.input} → ${e.expected}`).join("\n")}`,
  ].join("\n");
}

export async function generateAgentDesign(spec: Record<string, any>, title: string, extraContext = ""): Promise<AgentDesign> {
  const content = `AGENT: ${title}\n\nSPEC:\n${specToAgentText(spec)}\n\n`;
  const provider = activeProvider();
  // Two smaller calls in parallel: one schema this size exceeds strict structured-output limits.
  const skillsP = recommendSkills({ jobText: specToAgentText(spec), tools: [] }).catch(() => []);
  const [decisions, contracts] = await Promise.all([
    provider.completeJson<any>({
      system: SYSTEM + extraContext,
      effort: "high",
      schema: DECISIONS_SCHEMA,
      messages: [{ role: "user", content: content + "Make the design DECISIONS: approach, model, memory, retrieval, step limit, fallback, estimates." }],
    }),
    provider.completeJson<any>({
      system: SYSTEM + extraContext,
      effort: "high",
      schema: CONTRACTS_SCHEMA,
      messages: [{ role: "user", content: content + "Write the CONTRACTS: inputs, outputs, every tool contract, data sources, and the allowed-action → tool coverage." }],
    }),
  ]);
  const raw = { ...decisions, ...contracts };
  const skills = await skillsP;
  return {
    summary: raw.summary ?? "",
    approach: toChoice(raw.approach, ["agent", "workflow"]),
    model: modelChoice(raw.model),
    memory: toChoice(raw.memory, ["none", "conversation", "long-term"]),
    retrieval: raw.retrieval ?? { enabled: false, rationale: "" },
    inputs: raw.inputs ?? [],
    outputs: raw.outputs ?? [],
    tools: (raw.tools ?? []).map((t: any) => ({ ...t, enabled: true })),
    data_sources: raw.data_sources ?? [],
    step_limit: Number(raw.step_limit) || 8,
    fallback: raw.fallback ?? "",
    coverage: raw.coverage ?? [],
    est_cost_per_run: raw.est_cost_per_run ?? "",
    est_latency: raw.est_latency ?? "",
    login: recommendLogin(spec.agent),
    runs_per_month: Number(decisions.runs_per_month) || 300,
    skills,
    // One knowledge approach: document search only when the job needs outside knowledge; else facts live in skills.
    knowledge: { mode: raw.retrieval?.enabled ? "rag" : skills.length ? "skills" : "none", sources: [] },
  };
}

/** Shared with the design chat so a tool it adds has the same contract shape. */
export const TOOL_SCHEMA = CONTRACTS_SCHEMA.properties.tools.items;
export const DATA_SOURCE_SCHEMA = CONTRACTS_SCHEMA.properties.data_sources.items;
export { MODEL_IDS, SYSTEM as DESIGN_SYSTEM };
