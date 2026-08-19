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

/**
 * Dialogue budget. The PO used to decide for itself when it had "enough", which
 * with a ruthless-interrogation prompt meant 4-6 rounds of 3-6 questions — 15-30
 * questions and as many long waits before the owner saw a spec.
 *
 * Two rounds is the smallest budget that still buys a real back-and-forth: round
 * 1 probes the biggest unknowns, round 2 reacts to what the owner actually said.
 * One round would make this a form, not a conversation.
 *
 * The budget is enforced HERE, not in the prompt — a model that decides it needs
 * one more round doesn't get one. Anything still unresolved is not lost: it lands
 * in the spec's `open_questions` with the PO's own recommendation beside it.
 */
export const PO_MAX_ROUNDS = 2;
export const PO_MAX_QUESTIONS_PER_ROUND = 4;

export interface POQuestion {
  id: string;
  question: string;
  rationale: string;
  /** 3-5 tappable answer options for this idea. The owner can always pick "Other" and type instead. */
  options?: string[];
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

const PO_SYSTEM = `You are a seasoned, pragmatic Product Owner — and a customer-success obsessive.

Your north star is simple: solve a real, painful customer problem and everything else — revenue,
retention, growth — takes care of itself. Great products don't ship features; they relieve genuine
customer pain and make people's lives measurably better. Every question you ask traces back to that.

A business owner has handed you a raw idea. Your job is NOT to agree and move on. Pressure-test it
ruthlessly — always through the customer lens. Think through ALL of this every round:

- Customer problem first: is this a real, painful problem real people actually have — or a solution
  looking for a problem? How does the customer feel RIGHT NOW without this product?
- The customer's day: who is this person? What does their daily workflow look like? What do they
  currently do to work around this pain? What have they already tried and why did it fail them?
- Real vs. imagined pain: can the owner describe a specific real person who has this problem today —
  not a persona, an actual human? Have they talked to any potential customers yet?
- Scope: what is the minimum thing that genuinely solves the core customer problem vs. everything
  listed? If it doesn't directly address the pain, cut it.
- Differentiation: what already exists? If solutions exist, why does the customer still have this
  problem? What makes this one actually work for them in a way others haven't?
- Customer success metrics: how will the CUSTOMER know their problem is solved? Vanity metrics
  (signups, MAU) don't count — what concretely changes in the customer's life or work?
- Monetization: will the customer pay for relief from this pain? How much is solving this worth to them?
- Risks & assumptions: what has to be true about the customer's problem for this to work? What if
  the pain is shallower than assumed?

You think through every one of those. You do NOT ask about every one of them.

DEFAULT TO DECIDING, NOT ASKING. You are a senior PO, not a form. If you can make a sensible,
defensible call from the idea itself, MAKE IT and carry it into the spec as your recommendation —
that is your job, and it costs the owner nothing. Spend a question only when a different answer
would genuinely change what gets built, and when you cannot reasonably infer it. A question you
could have answered yourself is a question that wasted the owner's time.

Your question budget is deliberately tight, so triage hard. Rank every candidate question by "if the
owner answered the opposite, how much of the spec would change?" and ask only the top few. Ask SHARP,
specific questions tied to THIS idea and THIS customer — never generic boilerplate. Never ask what
the owner already answered, and never ask two questions that would be answered by the same fact.

Unanswered is fine. Anything you don't get to — or the owner skips — goes into the spec as an
explicit open question with your recommended default beside it. Nothing is lost by not asking, so
there is no reason to hoard questions.

Be direct and concise. You are a thought partner who sharpens the customer focus, not a yes-man. If
the idea is solution-first rather than customer-problem-first, name it and push back hard.

For EVERY question, provide 3-5 concrete answer options tailored to THIS specific idea — plausible,
mutually-exclusive answers the owner can tap to respond in one click (e.g. for "who is the primary
user?" → specific segments you infer from the idea, not generic placeholders). Make the options
genuinely useful guesses, not filler. Never add an "Other" option yourself — the interface always
offers a free-text "Other" so the owner can answer in their own words.`;

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
          options: {
            type: "array",
            description:
              "3-5 concrete, mutually-exclusive answer options specific to THIS idea, phrased as plausible answers the owner can tap. Do NOT include a generic 'Other' option — the UI always offers that.",
            items: { type: "string" },
          },
        },
        required: ["id", "question", "rationale", "options"],
      },
    },
  },
  required: ["assessment", "ready", "questions"],
};

/** Exported so the GitHub-import comprehension pass produces a downstream-identical spec. */
export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    problem_solved: {
      type: "string",
      description:
        "ONE short, CASUAL sentence (20 words or fewer) — how a chill young adult would explain the app to a friend in conversation, not a marketing line. Relaxed and plain-spoken: contractions are good, buzzwords/jargon/corporate-speak are bad. Lead with the problem it solves so it instantly clicks. Think 'it basically helps you…' energy (you can drop the 'basically'). e.g. 'It helps you find actual fun stuff to do near you instead of doomscrolling all weekend.'",
    },
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
    "problem_solved",
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

/** Which round a fresh turn would be — one round per PO turn already on record. */
export function currentRound(turns: POTurn[]): number {
  return turns.filter((t) => t.role === "po").length + 1;
}

/**
 * Generate the next PO turn: more questions, or readiness to synthesize.
 *
 * Once the round budget is spent this returns ready WITHOUT calling the model at
 * all — the owner's last answer goes straight to a spec button instead of sitting
 * through one more full generation just to be told the PO is done.
 */
export async function generatePOTurn(
  idea: string,
  turns: POTurn[],
  frameworkIds: string[] = []
): Promise<{ assessment: string; ready: boolean; questions: POQuestion[] }> {
  const round = currentRound(turns);

  if (round > PO_MAX_ROUNDS) {
    return {
      assessment:
        "That's what I needed. Anything still open goes into the spec as an explicit open question with my recommended default — you can overrule any of it there.",
      ready: true,
      questions: [],
    };
  }

  const isFinalRound = round === PO_MAX_ROUNDS;
  const budget =
    `\n\nROUND ${round} OF ${PO_MAX_ROUNDS}. Ask AT MOST ${PO_MAX_QUESTIONS_PER_ROUND} questions this round.` +
    (isFinalRound
      ? " This is your LAST round — there is no round after this one, you write the spec next. Ask only what you cannot" +
        " responsibly decide yourself, then let the rest go: infer it, state it as your recommendation, and record it as an open question."
      : " Spend this round on the assumptions that would most change what gets built. You get one more round after the owner replies.");

  const provider = activeProvider();
  const result = await provider.completeJson<{ assessment: string; ready: boolean; questions: POQuestion[] }>({
    system: await systemWithFrameworks(frameworkIds),
    // Deliberately below the synthesis effort: picking the sharpest few questions
    // is triage, not the deep reasoning the spec itself needs, and every round of
    // it is a wait the owner sits through.
    effort: "medium",
    schema: TURN_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          renderTranscript(idea, turns) +
          budget +
          "\n\nProduce your next turn. If a genuinely spec-changing unknown remains, ask a focused round of questions. If you can write a strong spec now, set ready=true with an empty questions array — earlier is better.",
      },
    ],
  });

  // Enforce the caps rather than trusting the prompt: a model that ignores the
  // budget must not be able to spend the owner's time anyway.
  result.questions = (result.questions ?? [])
    .slice(0, PO_MAX_QUESTIONS_PER_ROUND)
    .map((q, i) => ({ ...q, id: q.id || `q${turns.length}_${i}` }));
  if (result.questions.length === 0) result.ready = true;
  return result;
}

/** Synthesize the final product-spec from the idea + full dialogue. */
export async function synthesizeSpec(
  idea: string,
  turns: POTurn[],
  frameworkIds: string[] = [],
  extraContext = ""
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  return provider.completeJson<Record<string, unknown>>({
    system: (await systemWithFrameworks(frameworkIds)) + extraContext,
    effort: "high",
    schema: SPEC_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          renderTranscript(idea, turns) +
          "\n\nYou now have enough context. Write the structured product spec. Be opinionated and concrete — this spec steers market research, design, and engineering. Center everything on the customer problem: the problem statement should capture real customer pain, the value proposition should state what genuinely changes in the customer's life, and success metrics must be customer-outcome metrics (not vanity numbers). For 'problem_solved', write ONE short, casual sentence (≤20 words) the way a laid-back young adult would describe the app to a friend — contractions fine, no buzzwords or marketing tone, lead with the problem so it instantly clicks. Where the owner left gaps, make a clear recommendation from the customer's perspective and record the open question.",
      },
    ],
  });
}
