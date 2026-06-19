/**
 * Mock LLM provider — demo mode (MOCK_LLM=1). No API key, no network, instant.
 *
 * Masquerades as the active provider (same id the UI checks) so every phase's
 * "Generate" button works with plausible sample output. Two layers:
 *  1. Canned outputs for the schemas on the main demo path (PO dialogue/spec,
 *     iteration check-in/brief, iteration task graph, stack proposal, ops) so
 *     the loop feels real.
 *  2. A generic schema-filler fallback for everything else — walks the JSON
 *     schema and fabricates conforming sample values, so no phase ever crashes.
 */

import { LlmProvider, LlmCompleteJsonArgs } from "./types";

/* ------------------------------------------------------------------ */
/*  Generic schema filler (fallback for any schema)                    */
/* ------------------------------------------------------------------ */

function sampleString(name: string, description?: string): string {
  const base = description?.split(".")[0]?.trim();
  return base ? `[sample] ${base}` : `[sample] ${name.replace(/_/g, " ")}`;
}

function fillSchema(schema: any, name = "value", depth = 0): any {
  if (!schema || depth > 6) return null;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  switch (schema.type) {
    case "string":
      return sampleString(name, schema.description);
    case "number":
    case "integer":
      return 3;
    case "boolean":
      return false;
    case "array": {
      const n = depth === 0 ? 3 : 2;
      return Array.from({ length: n }, (_, i) => fillSchema(schema.items, `${name}_${i + 1}`, depth + 1));
    }
    case "object": {
      const out: Record<string, any> = {};
      for (const [key, prop] of Object.entries<any>(schema.properties ?? {})) {
        out[key] = fillSchema(prop, key, depth + 1);
      }
      return out;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Canned outputs for the demo path                                   */
/* ------------------------------------------------------------------ */

function requiredSet(schema: any): Set<string> {
  return new Set<string>(Array.isArray(schema?.required) ? schema.required : []);
}

function lastUserContent(args: LlmCompleteJsonArgs): string {
  return args.messages[args.messages.length - 1]?.content ?? "";
}

/** PO dialogue turn: one round of pushback, then ready once the owner has answered. */
function poTurn(args: LlmCompleteJsonArgs) {
  const ownerAnswered = lastUserContent(args).includes("Owner answered:");
  if (ownerAnswered) {
    return {
      assessment:
        "[mock] Good — the answers sharpen the customer problem enough to spec. The core pain is real, the first user is identifiable, and the must-have scope is clear.",
      ready: true,
      questions: [],
    };
  }
  return {
    assessment:
      "[mock] The idea has a plausible customer at its core, but the pain depth and the minimum lovable scope are still assumptions.",
    ready: false,
    questions: [
      {
        id: "q1",
        question: "Describe one real person you know who has this problem today — what did they do about it last time it happened?",
        rationale: "Tests whether the pain is observed or imagined.",
      },
      {
        id: "q2",
        question: "If the product could only do ONE thing in v1, what's the single moment it must nail for that person?",
        rationale: "Forces the minimum lovable scope.",
      },
      {
        id: "q3",
        question: "What are they using right now instead, and what specifically fails them about it?",
        rationale: "Differentiation comes from the failure of the workaround.",
      },
    ],
  };
}

const CANNED_SPEC = {
  summary:
    "[mock] FridgeChef turns a photo or quick list of what's in your fridge into tonight's realistic dinner plan — no shopping trip required.",
  problem_statement:
    "Busy home cooks stare at a full fridge at 6pm and still feel like there's 'nothing to eat'. Recipe apps assume you'll shop for missing ingredients; the real problem is deciding with what's already there, in under a minute, before everyone gets hangry.",
  target_users: [
    "Working parents cooking on weeknights with zero planning time",
    "Budget-conscious cooks trying to stop wasting groceries",
  ],
  value_proposition:
    "Open the app, tell it what you have, get 3 dinners you can actually make right now — leftovers become meals instead of waste.",
  goals: [
    "A user goes from 'fridge contents' to a chosen dinner in under 60 seconds",
    "Users report wasting visibly less food within a month",
  ],
  non_goals: ["Meal planning weeks ahead", "Grocery delivery integration", "Calorie/macro tracking in v1"],
  must_have_features: [
    { name: "Quick ingredient entry", description: "Type or speak what's in the fridge; common staples assumed by default." },
    { name: "Three realistic suggestions", description: "Ranked dinner ideas using ONLY what's on hand, with honest time estimates." },
    { name: "Step-through cook mode", description: "One step at a time, big text, kitchen-friendly." },
  ],
  nice_to_have_features: [
    { name: "Leftover tracker", description: "Remembers what you cooked and nudges before things expire." },
    { name: "Household sharing", description: "Partner can update the fridge list from their phone." },
  ],
  success_metrics: [
    "≥60% of sessions end with a recipe selected (the customer actually decided dinner)",
    "Week-2 retention ≥30% — people come back when the 6pm panic recurs",
    "Self-reported food waste down for active users",
  ],
  key_risks: [
    "Suggestion quality with sparse ingredient lists may disappoint",
    "Habit formation: the 6pm moment belongs to muscle memory (takeout apps)",
  ],
  open_questions: ["Photo-based fridge scanning: v2 or never?", "Price point for the household plan"],
  monetization:
    "[mock] Free for 3 suggestions/day; $4/mo household plan with sharing + leftover tracking once retention proves the habit.",
  recommendation:
    "[mock] Build it lean: ingredient entry + three good suggestions IS the product. Everything else waits until the 6pm habit is proven.",
};

const CANNED_APP_QUESTIONS = {
  questions: [
    {
      id: "app_suggestion_pick",
      question: "Of the dinner suggestions shown, how often do users pick one (vs. closing the app)?",
      why: "The pick rate IS the product working — it was the #1 success metric in the spec.",
    },
    {
      id: "app_entry_friction",
      question: "Where do people give up during ingredient entry — and how many ingredients does a typical session include?",
      why: "Entry friction is the most likely silent killer of the 60-second promise.",
    },
    {
      id: "app_repeat_dinner",
      question: "Are any users on a 3+ weeknight streak? What do those sessions look like?",
      why: "Streak users reveal the habit loop everyone else should be funneled into.",
    },
    {
      id: "app_waitlist_convert",
      question: "How many of the pre-launch waitlist signups activated, and what did the non-activators say?",
      why: "The waitlist promised intent — the gap between signup and use is the message problem to fix.",
    },
  ],
};

const CANNED_ITERATION_BRIEF = {
  traction_read: {
    verdict: "promising",
    summary:
      "[mock] Real signal: people who complete ingredient entry usually pick a dinner — the core promise works. But entry friction is losing half the audience before the magic moment, and weeknight retention is soft.",
    whats_working: [
      "62% of completed sessions end with a recipe picked — matches the spec's #1 metric",
      "Instagram reels in the brand voice drive steady signups at zero cost",
    ],
    whats_not: [
      "~half of new users abandon during ingredient entry (too much typing on a phone at 6pm)",
      "Week-2 retention 19% vs. the 30% target — the habit isn't sticking yet",
    ],
    data_gaps: ["No signal yet on willingness to pay — the household plan hasn't been offered to anyone"],
  },
  next_moves: [
    {
      id: "move_entry",
      title: "Cut ingredient entry to under 15 seconds (smart staples + tap-chips for common items)",
      type: "fix",
      why: "Half the funnel dies at entry — the check-in named typing friction explicitly.",
      expected_impact: "More users reach the suggestion moment, which already converts well.",
      effort: "small",
    },
    {
      id: "move_dinner_reminder",
      title: "Opt-in '6pm — what's for dinner?' nudge",
      type: "product",
      why: "Retention is a remembering problem; the 6pm panic is the natural trigger the app should own.",
      expected_impact: "Directly attacks the week-2 retention gap.",
      effort: "small",
    },
    {
      id: "move_waitlist_winback",
      title: "Win-back email to non-activated waitlist signups with a one-tap demo fridge",
      type: "growth",
      why: "Pre-sold audience already exists; the gap is activation, not awareness.",
      expected_impact: "Cheapest possible user growth — they already said yes once.",
      effort: "small",
    },
    {
      id: "move_household",
      title: "Soft-offer the $4/mo household plan to streak users",
      type: "growth",
      why: "Willingness-to-pay is the biggest data gap; streak users are the likeliest payers.",
      expected_impact: "First revenue signal without building new features.",
      effort: "medium",
    },
  ],
  recommended_focus: ["move_entry", "move_dinner_reminder"],
  open_questions: ["Should the nudge be push or email-first?", "Does faster entry cannibalize suggestion quality?"],
};

function iterationTaskGraph(args: LlmCompleteJsonArgs) {
  const m = args.system.match(/id "IT(\d+)"/);
  const c = m ? m[1] : "2";
  return {
    milestones: [
      {
        id: `IT${c}`,
        name: "Faster entry + the 6pm habit loop",
        goal: "Ingredient entry takes <15s and opted-in users get the dinner nudge — existing flows untouched.",
        tasks: [
          {
            id: `IT${c}.1`,
            title: "Add tap-chip quick entry with smart staples",
            details:
              "[mock] Extend the existing ingredient form: top-20 common items as tap chips, staples (oil, salt, etc.) assumed by default with an editable toggle. Reuse the current form state — do not rebuild the screen.",
            acceptance_criteria: ["Entry with 5 items takes under 15s by tap only", "npx tsc --noEmit passes", "existing entry tests still pass"],
          },
          {
            id: `IT${c}.2`,
            title: "Opt-in 6pm dinner nudge",
            details: "[mock] Settings toggle + scheduled reminder using the existing notification util; deep-links to a fresh entry session.",
            acceptance_criteria: ["Toggle persists per user", "Nudge fires in the demo timezone", "unauthenticated users cannot enable it"],
          },
          {
            id: `IT${c}.3`,
            title: "Verification pass",
            details: "[mock] Full check: typecheck, tests, build, npm audit; update LAUNCH-GUIDE.md with the nudge setup note.",
            acceptance_criteria: ["build green", "npm audit: no criticals", "LAUNCH-GUIDE.md mentions the reminder feature"],
          },
        ],
      },
    ],
  };
}

const CANNED_STACK = {
  choices: [],
  architecture_summary:
    "[mock] Next.js app with API routes on AWS Amplify; Supabase for the fridge/recipe data and auth. Plain studio defaults — nothing about this product justifies a deviation.",
  mermaid_diagram: "graph TD\n  U[User] --> FE[Next.js frontend]\n  FE --> API[API routes]\n  API --> DB[(Supabase)]\n  API --> AUTH[Supabase Auth]",
  key_decisions: ["[mock] Suggestions computed server-side so the ranking logic stays private", "[mock] Ingredient list stored per household, not per user"],
};

function frameworkSelection(args: LlmCompleteJsonArgs) {
  const ids = Array.from(args.system.matchAll(/- ([a-z0-9-]+):/g)).map((m) => m[1]);
  return { framework_ids: ids.slice(0, 3), rationale: "[mock] Picked the playbooks that pressure-test demand and scope for this idea." };
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export const mockProvider: LlmProvider = {
  // Same id the UI checks for "is the AI connected" — demo mode is always connected.
  id: "ai-anthropic",
  name: "Claude (mock — demo mode)",
  status: "active",

  async isConfigured() {
    return true;
  },

  async configure() {
    return { ok: true };
  },

  async completeJson<T>(args: LlmCompleteJsonArgs): Promise<T> {
    const req = requiredSet(args.schema);
    // Small delay so the UI's busy states are visible, like a real call.
    await new Promise((r) => setTimeout(r, 400));

    if (req.has("assessment") && req.has("ready")) return poTurn(args) as T;
    if (req.has("problem_statement") && req.has("monetization")) return CANNED_SPEC as T;
    if (req.has("framework_ids")) return frameworkSelection(args) as T;
    if (req.has("traction_read")) return CANNED_ITERATION_BRIEF as T;
    if (req.has("questions") && req.size === 1) return CANNED_APP_QUESTIONS as T;
    if (req.has("milestones") && /IT\d/.test(args.system)) return iterationTaskGraph(args) as T;
    if (req.has("choices") && req.has("mermaid_diagram")) return CANNED_STACK as T;

    // Everything else: conforming sample values straight from the schema.
    return fillSchema(args.schema) as T;
  },
};
