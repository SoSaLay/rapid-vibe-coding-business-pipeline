/**
 * Phase 4 — Pre-Marketing (validation stage 2).
 *
 * Proves real intent: generate a landing-page + waitlist + pre-sell offer, then
 * (later stages) ship it and track signups against demand thresholds.
 *
 * Stage 1 (this file's `generateKit`): synthesize the validation kit from the
 * product-spec + market-report, shaped by auto-selected marketing-skills playbooks.
 * Reuses the real forum quotes from Phase 3 as social proof.
 */

import { activeProvider } from "../llm/registry";
import { buildFrameworkContext, frameworkCatalog } from "../frameworks";

export interface FrameworkSelection {
  ids: string[];
  rationale: string;
}

const SELECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    framework_ids: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
  required: ["framework_ids", "rationale"],
};

/** Auto-select the marketing playbooks most relevant to this idea. */
export async function selectMarketingFrameworks(context: string): Promise<FrameworkSelection> {
  const catalog = await frameworkCatalog("marketing-skills");
  if (catalog.length === 0) return { ids: [], rationale: "" };
  const menu = catalog.map((f) => `- ${f.id}: ${f.description}`).join("\n");
  const provider = activeProvider();
  const result = await provider.completeJson<{ framework_ids: string[]; rationale: string }>({
    system:
      "You are a SaaS marketer choosing which playbooks to apply when building a pre-launch validation campaign " +
      "(landing page + waitlist + pre-sell offer). Pick the few most relevant.\n\nPlaybooks (id: when to use):\n\n" +
      menu,
    effort: "low",
    schema: SELECT_SCHEMA,
    messages: [{ role: "user", content: `${context}\n\nChoose the most relevant playbook ids.` }],
  });
  const valid = new Set(catalog.map((f) => f.id));
  return { ids: (result.framework_ids || []).filter((id) => valid.has(id)), rationale: result.rationale || "" };
}

const KIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    positioning: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem_statement: { type: "string", description: "Specific audience + problem + outcome, one sentence." },
        headline: { type: "string", description: "Outcome-focused, ≤10 words." },
        subheadline: { type: "string", description: "The mechanism / how it works." },
        benefit_bullets: { type: "array", items: { type: "string" }, description: "3-5 outcome-focused bullets." },
        faq: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { q: { type: "string" }, a: { type: "string" } },
            required: ["q", "a"],
          },
        },
      },
      required: ["problem_statement", "headline", "subheadline", "benefit_bullets", "faq"],
    },
    offer: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", description: "e.g. founder discount, $X deposit, lifetime deal, LOI." },
        headline: { type: "string" },
        details: { type: "string", description: "The de-risking pre-sell copy (urgency, refund, scarcity)." },
        price_hypothesis: { type: "string", description: "A price to test, grounded in the market pricing signal." },
      },
      required: ["type", "headline", "details", "price_hypothesis"],
    },
    qualifying_questions: {
      type: "array",
      description: "1-2 signup questions to confirm ICP match and urgency.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { question: { type: "string" }, why: { type: "string" } },
        required: ["question", "why"],
      },
    },
    social_proof: {
      type: "array",
      description: "Real problem-validation quotes to show as social proof (reuse the market-report quotes).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { quote: { type: "string" }, source: { type: "string" } },
        required: ["quote", "source"],
      },
    },
    distribution_plan: {
      type: "array",
      description: "Where to drive ICP traffic + a ready-to-send outreach template per channel.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          channel: { type: "string" },
          tactic: { type: "string" },
          template: { type: "string", description: "A copy-paste outreach/post template for this channel." },
        },
        required: ["channel", "tactic", "template"],
      },
    },
    fake_door_tests: {
      type: "array",
      description: "Optional feature fake-door tests to gauge demand for specific features.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { feature: { type: "string" }, copy: { type: "string" } },
        required: ["feature", "copy"],
      },
    },
    success_thresholds: {
      type: "object",
      additionalProperties: false,
      properties: {
        landing_conversion: { type: "string", description: "Target email conversion, e.g. '5%+ from cold traffic'." },
        waitlist_target: { type: "string", description: "Signup count that signals validation, e.g. '100+'." },
        presale_target: { type: "string", description: "Money signal, e.g. '10-20 paid pre-sales'." },
        decision_rule: { type: "string", description: "Proceed / pivot / stop rule." },
      },
      required: ["landing_conversion", "waitlist_target", "presale_target", "decision_rule"],
    },
  },
  required: [
    "positioning",
    "offer",
    "qualifying_questions",
    "social_proof",
    "distribution_plan",
    "fake_door_tests",
    "success_thresholds",
  ],
};

function specToText(spec: Record<string, any>): string {
  const f = (arr: any[]) => (Array.isArray(arr) ? arr.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Value proposition: ${spec.value_proposition || ""}`,
    `Must-haves: ${(spec.must_have_features || []).map((x: any) => x.name).join("; ")}`,
  ].join("\n");
}

function marketToText(market: Record<string, any> | null): string {
  if (!market) return "(no market report — Market Researcher was skipped)";
  const quotes = (market.representative_quotes || [])
    .map((q: any) => `- "${q.quote}" — ${q.source} (${q.url})`)
    .join("\n");
  const comp = (market.competitive_landscape || [])
    .map((c: any) => `- ${c.name}: ${c.positioning}; gap: ${c.gaps}`)
    .join("\n");
  return [
    `Positioning hint: ${market.positioning || ""}`,
    `Pricing signal: ${market.pricing_signal || ""}`,
    `Target segments: ${(market.target_segments || []).map((s: any) => s.segment).join("; ")}`,
    `Competitors:\n${comp}`,
    `Real voices (use as social proof):\n${quotes}`,
  ].join("\n");
}

export async function generateKit(
  spec: Record<string, any>,
  market: Record<string, any> | null,
  frameworkIds: string[]
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  const frameworks = await buildFrameworkContext(frameworkIds);
  const system =
    "You are a SaaS marketer creating a pre-launch validation campaign: a landing page, a waitlist, and a " +
    "de-risking pre-sell offer designed to prove real demand with a small budget. Write sharp, specific, " +
    "conversion-focused copy grounded in the real evidence provided. Reuse the real quotes as social proof. " +
    "Money is the strongest signal — make the offer ask for a real commitment." +
    (frameworks ? `\n\n---\n\n${frameworks}` : "");

  return provider.completeJson<Record<string, unknown>>({
    system,
    effort: "high",
    schema: KIT_SCHEMA,
    messages: [
      {
        role: "user",
        content: `PRODUCT SPEC:\n${specToText(spec)}\n\nMARKET RESEARCH:\n${marketToText(market)}\n\nGenerate the validation kit.`,
      },
    ],
  });
}
