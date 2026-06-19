/**
 * Phase 11 — Iteration (optional). The loop-closer.
 *
 * The app is live and producing real signal. This phase runs a structured
 * check-in (core PO questions + LLM questions specific to THIS app; answers
 * by voice or text), synthesizes an honest traction read + ranked next moves,
 * and puts the decision where it belongs — with the owner:
 *
 *   next-cycle      → iteration-brief artifact, cycle counter ticks, Product
 *                     Owner re-activates with the brief as the new raw input
 *   keep-collecting → too early to call; stay in the ops/posting loops and
 *                     come back with more data (check-in saved, re-runnable)
 *   archive         → pipeline stops; project flagged archived (reversible,
 *                     nothing deleted), learnings recorded in a final brief
 *
 * The business is never finished until the owner says so.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";

/* ------------------------------------------------------------------ */
/*  Check-in questions                                                  */
/* ------------------------------------------------------------------ */

export interface CheckinQuestion {
  id: string;
  question: string;
  why: string;
  /** core = same every cycle; app = generated for this specific product */
  kind: "core" | "app";
}

/** The questions a product owner always wants answered before iterating. */
export const CORE_QUESTIONS: CheckinQuestion[] = [
  {
    id: "core_users",
    question: "How many users / signups do you have so far?",
    why: "The baseline number every other signal hangs off.",
    kind: "core",
  },
  {
    id: "core_returning",
    question: "How many of them came back in the last week?",
    why: "Retention is the truth-teller — it says whether the product actually solves the problem.",
    kind: "core",
  },
  {
    id: "core_revenue",
    question: "Any revenue yet? How much, from how many customers?",
    why: "Paying customers are the strongest proof the pain is real.",
    kind: "core",
  },
  {
    id: "core_feedback",
    question: "What's the best thing a user said, and the worst complaint you've heard?",
    why: "The extremes show what to double down on and what's driving people away.",
    kind: "core",
  },
  {
    id: "core_marketing",
    question: "Is the marketing working — views, clicks, replies? Which channel feels alive?",
    why: "Tells us whether the growth problem is reach or conversion.",
    kind: "core",
  },
  {
    id: "core_time",
    question: "What's eating most of your time right now?",
    why: "A solo founder's hours are the scarcest resource — iteration should buy some back.",
    kind: "core",
  },
  {
    id: "core_gut",
    question: "Gut check: what do YOU think is the single biggest thing holding this back?",
    why: "The owner sees things no metric captures.",
    kind: "core",
  },
];

/* ------------------------------------------------------------------ */
/*  Auto-pulled signals (deterministic — no retyping what we know)     */
/* ------------------------------------------------------------------ */

export interface PulledSignal {
  label: string;
  value: string;
}

/* ------------------------------------------------------------------ */
/*  App-specific question generation                                    */
/* ------------------------------------------------------------------ */

const APP_QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      description: "3-5 check-in questions specific to THIS app — never generic.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          why: { type: "string", description: "One line: what this answer unlocks." },
        },
        required: ["id", "question", "why"],
      },
    },
  },
  required: ["questions"],
};

export async function generateAppQuestions(context: string): Promise<CheckinQuestion[]> {
  const provider = activeProvider();
  const result = await provider.completeJson<{ questions: Omit<CheckinQuestion, "kind">[] }>({
    system:
      "You are a customer-obsessed Product Owner preparing an iteration check-in for a live product. " +
      "Given the product context, write 3-5 questions about signals SPECIFIC to this app that the core " +
      "check-in (users, retention, revenue, feedback, marketing, time) would miss — e.g. usage of a " +
      "particular feature, conversion at a specific step, a threshold from pre-marketing. " +
      "Every question must be answerable by a solo founder from what they can actually see.",
    effort: "low",
    schema: APP_QUESTIONS_SCHEMA,
    messages: [{ role: "user", content: context }],
  });
  return (result.questions ?? []).map((q, i) => ({
    ...q,
    id: q.id || `app_${i}`,
    kind: "app" as const,
  }));
}

/* ------------------------------------------------------------------ */
/*  Synthesis → iteration brief                                         */
/* ------------------------------------------------------------------ */

export type TractionVerdict = "strong" | "promising" | "weak" | "too-early";
export type MoveType = "growth" | "product" | "fix";
export type MoveEffort = "small" | "medium" | "large";

export interface NextMove {
  id: string;
  title: string;
  type: MoveType;
  why: string;
  expected_impact: string;
  effort: MoveEffort;
}

export interface IterationBrief {
  traction_read: {
    verdict: TractionVerdict;
    summary: string;
    whats_working: string[];
    whats_not: string[];
    data_gaps: string[];
  };
  next_moves: NextMove[];
  recommended_focus: string[];
  open_questions: string[];
}

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    traction_read: {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string", enum: ["strong", "promising", "weak", "too-early"] },
        summary: { type: "string", description: "2-3 honest sentences. No cheerleading, no doom." },
        whats_working: { type: "array", items: { type: "string" } },
        whats_not: { type: "array", items: { type: "string" } },
        data_gaps: { type: "array", items: { type: "string" }, description: "What the data can't tell us yet." },
      },
      required: ["verdict", "summary", "whats_working", "whats_not", "data_gaps"],
    },
    next_moves: {
      type: "array",
      description: "3-5 candidate moves, RANKED best-first. A mix of growth, product, and fix.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: ["growth", "product", "fix"] },
          why: { type: "string", description: "The evidence from the check-in that points here." },
          expected_impact: { type: "string", description: "What concretely improves for customers / the business." },
          effort: { type: "string", enum: ["small", "medium", "large"] },
        },
        required: ["id", "title", "type", "why", "expected_impact", "effort"],
      },
    },
    recommended_focus: {
      type: "array",
      items: { type: "string" },
      description: "ids of the 1-3 moves you'd pick for the next cycle. The owner can override.",
    },
    open_questions: { type: "array", items: { type: "string" } },
  },
  required: ["traction_read", "next_moves", "recommended_focus", "open_questions"],
};

const SYNTH_SYSTEM = `You are a customer-obsessed Product Owner reviewing a live product's first real data.

The owner has answered a structured check-in. Your job:
1. An HONEST traction read. "too-early" is a legitimate verdict — don't invent signal that isn't
   there, and don't sugar-coat weak numbers. Tie every claim to something in the answers.
2. 3-5 ranked next moves. Each is one of: growth (get more of the right people in), product (make
   the core problem-solving moment better), or fix (remove something actively hurting). Rank by
   expected customer impact per unit of solo-founder effort. Businesses compound through consistent
   small steps — favor small/medium moves that can ship within one pipeline cycle over grand plans.
3. Recommend 1-3 moves as the next-cycle focus, but remember the decision is the owner's.

The customer lens rules everything: a move only matters if it helps real customers get the problem
solved better, or helps more of the right customers find the product. Vanity work is out.`;

export async function synthesizeIteration(
  context: string,
  questions: CheckinQuestion[],
  answers: Record<string, string>
): Promise<IterationBrief> {
  const provider = activeProvider();
  const answered = questions
    .map((q) => `Q (${q.kind}): ${q.question}\nA: ${answers[q.id]?.trim() || "(no answer)"}`)
    .join("\n\n");

  const result = await provider.completeJson<IterationBrief>({
    system: SYNTH_SYSTEM,
    effort: "high",
    schema: BRIEF_SCHEMA,
    messages: [
      {
        role: "user",
        content: `${context}\n\nCHECK-IN ANSWERS:\n\n${answered}\n\nProduce the iteration brief.`,
      },
    ],
  });

  // Stable move ids + focus ids that actually exist
  result.next_moves = (result.next_moves ?? []).map((m, i) => ({ ...m, id: m.id || `move_${i}` }));
  const valid = new Set(result.next_moves.map((m) => m.id));
  result.recommended_focus = (result.recommended_focus ?? []).filter((id) => valid.has(id)).slice(0, 3);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Context builder (shared by question gen + synthesis)               */
/* ------------------------------------------------------------------ */

export function buildIterationContext(args: {
  productTitle: string;
  cycle: number;
  spec: Record<string, any> | null;
  ideaType?: string;
  deploy: Record<string, any> | null;
  campaign: Record<string, any> | null;
  audienceBrief: Record<string, any> | null;
  signals: PulledSignal[];
}): string {
  const parts: string[] = [`PRODUCT: ${args.productTitle} (iteration check-in, cycle ${args.cycle})`];
  if (args.ideaType) parts.push(ideaTypeContext(args.ideaType));
  const spec = args.spec;
  if (spec) {
    const specLines: string[] = [];
    if (spec.summary) specLines.push(`Summary: ${spec.summary}`);
    if (spec.problem_statement) specLines.push(`Problem: ${spec.problem_statement}`);
    if (spec.success_metrics?.length) specLines.push(`Success metrics from the spec: ${spec.success_metrics.join("; ")}`);
    if (spec.must_have_features?.length)
      specLines.push(`Shipped features: ${spec.must_have_features.map((f: any) => f.name).join(", ")}`);
    parts.push(`PRODUCT SPEC:\n${specLines.join("\n")}`);
  }
  if (args.deploy) {
    const prod = (args.deploy.environments || []).find((e: any) => e.name === "prod");
    if (prod?.url) parts.push(`LIVE AT: ${prod.url}`);
  }
  if (args.campaign) {
    const ch = (args.campaign.channels || []).map((c: any) => c.name).join(", ");
    if (ch) parts.push(`MARKETING CHANNELS: ${ch}`);
    if (args.campaign.metrics_to_watch?.length)
      parts.push(`Metrics the campaign plan said to watch: ${args.campaign.metrics_to_watch.join("; ")}`);
  }
  if (args.audienceBrief?.thresholds) {
    parts.push(`PRE-LAUNCH THRESHOLDS SET IN PHASE 4: ${JSON.stringify(args.audienceBrief.thresholds)}`);
  }
  if (args.signals.length) {
    parts.push(
      `WHAT THE PIPELINE ALREADY KNOWS (auto-pulled — don't ask about these):\n` +
        args.signals.map((s) => `- ${s.label}: ${s.value}`).join("\n")
    );
  }
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  PO handoff — renders the brief as the next cycle's raw input        */
/* ------------------------------------------------------------------ */

export function renderBriefForPO(
  brief: IterationBrief,
  focusIds: string[],
  answers: Record<string, string>,
  questions: CheckinQuestion[],
  cycle: number
): string {
  const focus = brief.next_moves.filter((m) => focusIds.includes(m.id));
  const lines: string[] = [
    `ITERATION CONTEXT — this is cycle ${cycle}. The product is LIVE; this dialogue refines it, not a new idea.`,
    "",
    `Traction read (${brief.traction_read.verdict}): ${brief.traction_read.summary}`,
    `Working: ${brief.traction_read.whats_working.join("; ") || "(none noted)"}`,
    `Not working: ${brief.traction_read.whats_not.join("; ") || "(none noted)"}`,
    "",
    "OWNER'S CHOSEN FOCUS FOR THIS CYCLE:",
    ...focus.map((m) => `- [${m.type}] ${m.title} — ${m.why} (expected: ${m.expected_impact})`),
    "",
    "KEY CHECK-IN ANSWERS:",
    ...questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => `- ${q.question} → ${answers[q.id].trim()}`),
  ];
  return lines.join("\n");
}
