/**
 * Phase 2 — Product Owner.
 *
 * Two stages, both powered by the active LLM provider:
 *   1. Pushback dialogue — the PO interrogates the raw idea like a real PO would
 *      (problem, users, scope, must-haves, metrics, risks, monetization), one
 *      round at a time, until it has enough to write a crisp spec.
 *   2. Synthesis — turns the idea + the full dialogue into a structured
 *      product-spec artifact that steers every downstream phase.
 */

import { activeProvider } from "../llm/registry";
import { buildFrameworkContext, frameworkCatalog } from "../frameworks";

export interface POQuestion {
  id: string;
  question: string;
  rationale: string;
}

export interface POTurn {
  role: "po" | "owner";
  assessment?: string;
  questions?: POQuestion[];
  text?: string;
}

export interface FrameworkSelection {
  ids: string[];
  rationale: string;
}

export interface PODialogue {
  turns: POTurn[];
  ready: boolean;
  round: number;
  frameworks?: FrameworkSelection;
}

const PO_SYSTEM = `You are a seasoned, pragmatic Product Owner — the brain of a product pipeline.
A business owner has handed you a raw idea. Your job in this stage is NOT to agree and move on.
Like a real PO, you interrogate the idea before any spec is written. Push back constructively:

- Problem: what specific problem does this solve, and for whom? Is it a real, painful problem?
- Users: who is the actual target user vs. who they imagine? Who is NOT the user?
- Scope: what is the minimum lovable version vs. everything they listed?
- Differentiation: what already exists, and why would anyone switch?
- Success: how will we know it worked? Concrete signals/metrics.
- Constraints & monetization: budget, timeline, how it makes money.
- Risks & assumptions: what has to be true for this to work?

Ask SHARP, specific questions tied to THIS idea — never generic boilerplate. Ask in focused rounds
of 3-6 questions. Do not ask things the owner already answered. When you genuinely have enough to
write a strong, opinionated spec, set ready=true and stop asking.

Be direct and concise. You are a thought partner who improves the idea, not a yes-man.`;

const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessment: { type: "string", description: "1-3 sentence read on the idea so far and what's still unclear." },
    ready: { type: "boolean", description: "True only when you have enough to write a strong product spec." },
    questions: {
      type: "array",
      description: "Pointed clarifying questions for this round. Empty when ready=true.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          rationale: { type: "string", description: "Why this matters / what assumption it tests." },
        },
        required: ["id", "question", "rationale"],
      },
    },
  },
  required: ["assessment", "ready", "questions"],
};

const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    problem_statement: { type: "string" },
    target_users: { type: "array", items: { type: "string" } },
    value_proposition: { type: "string" },
    goals: { type: "array", items: { type: "string" } },
    non_goals: { type: "array", items: { type: "string" } },
    must_have_features: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
      },
    },
    nice_to_have_features: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
      },
    },
    success_metrics: { type: "array", items: { type: "string" } },
    key_risks: { type: "array", items: { type: "string" } },
    open_questions: { type: "array", items: { type: "string" } },
    monetization: { type: "string" },
    recommendation: {
      type: "string",
      description: "The PO's opinionated take: is this worth building, and how to approach it.",
    },
  },
  required: [
    "summary",
    "problem_statement",
    "target_users",
    "value_proposition",
    "goals",
    "non_goals",
    "must_have_features",
    "nice_to_have_features",
    "success_metrics",
    "key_risks",
    "open_questions",
    "monetization",
    "recommendation",
  ],
};

const SELECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    framework_ids: {
      type: "array",
      description: "ids of the playbooks most relevant to THIS idea (typically 2-5).",
      items: { type: "string" },
    },
    rationale: { type: "string", description: "One sentence: why these playbooks fit this idea." },
  },
  required: ["framework_ids", "rationale"],
};

/**
 * Auto-select the playbooks that best fit this idea (option 1: the PO chooses).
 * Returns the chosen ids + a one-line rationale shown to the owner, who can override.
 */
export async function selectFrameworks(idea: string): Promise<FrameworkSelection> {
  const catalog = await frameworkCatalog();
  if (catalog.length === 0) return { ids: [], rationale: "" };
  const menu = catalog.map((f) => `- ${f.id}: ${f.description}`).join("\n");
  const provider = activeProvider();
  const result = await provider.completeJson<{ framework_ids: string[]; rationale: string }>({
    system:
      "You are a Product Owner choosing which PM playbooks to apply to an idea. " +
      "Pick the few most relevant — favor ones that pressure-test the idea's biggest unknowns. " +
      "Available playbooks (id: when to use):\n\n" +
      menu,
    effort: "low",
    schema: SELECT_SCHEMA,
    messages: [{ role: "user", content: `IDEA:\n${idea}\n\nChoose the most relevant playbook ids.` }],
  });
  const valid = new Set(catalog.map((f) => f.id));
  return { ids: (result.framework_ids || []).filter((id) => valid.has(id)), rationale: result.rationale || "" };
}

async function systemWithFrameworks(frameworkIds: string[]): Promise<string> {
  const context = await buildFrameworkContext(frameworkIds || []);
  return context ? `${PO_SYSTEM}\n\n---\n\n${context}` : PO_SYSTEM;
}

function renderTranscript(idea: string, turns: POTurn[]): string {
  const lines: string[] = ["RAW IDEA FROM THE BUSINESS OWNER:", idea, "", "DIALOGUE SO FAR:"];
  if (turns.length === 0) lines.push("(none yet — this is your first round)");
  for (const t of turns) {
    if (t.role === "po") {
      if (t.assessment) lines.push(`PO assessment: ${t.assessment}`);
      for (const q of t.questions ?? []) lines.push(`PO asked: ${q.question}`);
    } else {
      lines.push(`Owner answered: ${t.text}`);
    }
  }
  return lines.join("\n");
}

/** Generate the next PO turn: more questions, or readiness to synthesize. */
export async function generatePOTurn(
  idea: string,
  turns: POTurn[],
  frameworkIds: string[] = []
): Promise<{ assessment: string; ready: boolean; questions: POQuestion[] }> {
  const provider = activeProvider();
  const result = await provider.completeJson<{ assessment: string; ready: boolean; questions: POQuestion[] }>({
    system: await systemWithFrameworks(frameworkIds),
    effort: "high",
    schema: TURN_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          renderTranscript(idea, turns) +
          "\n\nProduce your next turn. If you still have important unknowns, ask a focused round of questions. If you have enough to write a strong spec, set ready=true with an empty questions array.",
      },
    ],
  });
  // Ensure stable ids
  result.questions = (result.questions ?? []).map((q, i) => ({ ...q, id: q.id || `q${turns.length}_${i}` }));
  return result;
}

/** Synthesize the final product-spec from the idea + full dialogue. */
export async function synthesizeSpec(
  idea: string,
  turns: POTurn[],
  frameworkIds: string[] = []
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  return provider.completeJson<Record<string, unknown>>({
    system: await systemWithFrameworks(frameworkIds),
    effort: "high",
    schema: SPEC_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          renderTranscript(idea, turns) +
          "\n\nYou now have enough context. Write the structured product spec. Be opinionated and concrete — this spec steers market research, design, and engineering. Where the owner left gaps, make a clear recommendation and record the open question.",
      },
    ],
  });
}
