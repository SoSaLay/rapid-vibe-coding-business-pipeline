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
import { ideaTypeContext } from "../idea-types";
import { buildFrameworkContext, frameworkCatalog } from "../frameworks";
import { SKIMMABLE_STYLE } from "./brevity";

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
        primary_keyword: {
          type: "string",
          description:
            "The single bottom-of-funnel / commercial-intent search query this page targets (what a ready-to-act ICP would actually type, e.g. 'AI meal planner for busy parents'). Specific long-tail, not a broad head term.",
        },
        seo_title: {
          type: "string",
          description:
            "SEO title tag, 50-60 characters. Front-load the primary_keyword, then a concrete promise. NOT the marketing headline — this is for search snippets. e.g. 'AI Meal Planner for Busy Parents — Dinner in 5 Min'.",
        },
        seo_description: {
          type: "string",
          description:
            "Meta description, 150-160 characters. Use the primary_keyword naturally, promise a specific outcome, end with a soft CTA. This is the search snippet that earns the click.",
        },
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
      required: ["primary_keyword", "seo_title", "seo_description", "problem_statement", "headline", "subheadline", "benefit_bullets", "faq"],
    },
    offer: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", description: "e.g. founder discount, $X deposit, lifetime deal, LOI." },
        headline: { type: "string" },
        details: { type: "string", description: "The de-risking pre-sell copy (urgency, refund, scarcity). AT MOST 2 sentences." },
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
    content_library: {
      type: "array",
      description:
        "Evergreen content direction for each platform — NOT specific posts, but a strategic guide: what angle to take, what themes resonate, what content types perform, and 2-3 hook starters to get going. Covers X (Twitter), LinkedIn, Instagram, Short-form video (TikTok/Reels/Shorts), Long-form (YouTube/blog), and Forums/communities.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          platform: { type: "string", description: "Platform name, e.g. 'X (Twitter)', 'LinkedIn', 'Instagram', 'Short-form video', 'Long-form', 'Forums'." },
          content_type: { type: "string", description: "Primary format: thread, carousel, reel, video essay, forum post, etc." },
          audience_on_platform: { type: "string", description: "Who you reach here and their mindset. ONE sentence, ≤20 words." },
          strategy: { type: "string", description: "The angle and tone for this platform. ONE sentence, ≤20 words." },
          themes: {
            type: "array",
            items: { type: "string" },
            description: "3-5 evergreen content themes that will draw ICP attention and funnel to the landing page.",
          },
          posting_cadence: { type: "string", description: "Realistic posting frequency, e.g. '3x/week', 'daily stories + 2 feed posts/week'." },
          hook_examples: {
            type: "array",
            items: { type: "string" },
            description: "2-3 strong openers/hooks the creator can riff on — not full posts, just compelling starters.",
          },
          cta_direction: { type: "string", description: "How to send people to the landing page (subtle vs direct). ONE sentence." },
        },
        required: ["platform", "content_type", "audience_on_platform", "strategy", "themes", "posting_cadence", "hook_examples", "cta_direction"],
      },
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
    "content_library",
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
    ideaTypeContext(spec.idea_type),
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

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["proceed", "pivot", "stop", "keep-collecting"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    demand_summary: { type: "string", description: "What the signups + pre-sale interest tell us, honestly. AT MOST 2 sentences — lead with the verdict." },
    segment_insights: {
      type: "array",
      description: "Insights from the qualifying answers (who's signing up, urgency, ICP fit).",
      items: { type: "string" },
    },
    validated_positioning: { type: "string", description: "The positioning the evidence supports. ONE sentence." },
    what_to_change: { type: "array", items: { type: "string", description: "A fragment, ≤12 words, starting with a verb." } },
    recommendation: { type: "string", description: "The single next move, stated as an instruction. AT MOST 2 sentences." },
  },
  required: ["verdict", "confidence", "demand_summary", "segment_insights", "validated_positioning", "what_to_change", "recommendation"],
};

export interface DemandMetrics {
  signups: number;
  presale_interest: number;
  answers_sample: string[];
}

/** Stage 3: turn real signup data into the audience-brief verdict. */
export async function synthesizeAudienceBrief(
  kit: Record<string, any>,
  metrics: DemandMetrics
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  const thresholds = kit.success_thresholds || {};
  return provider.completeJson<Record<string, unknown>>({
    system:
      "You are evaluating a pre-launch waitlist campaign against its own success thresholds. Be honest and " +
      "skeptical — emails are weak signal, pre-sale/deposit interest is strong signal. If the numbers are thin, " +
      "say 'keep-collecting' or 'pivot' rather than greenlighting. 'proceed' requires a real demand signal.\n\n" +
      SKIMMABLE_STYLE,
    effort: "high",
    schema: BRIEF_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `SUCCESS THRESHOLDS (set earlier):\n${JSON.stringify(thresholds, null, 2)}\n\n` +
          `ACTUAL RESULTS:\n- Waitlist signups: ${metrics.signups}\n- Pre-sale interest (checked "I'd pre-order"): ${metrics.presale_interest}\n` +
          `- Sample qualifying answers:\n${metrics.answers_sample.map((a) => `  • ${a}`).join("\n") || "  (none)"}\n\n` +
          "Deliver the audience-brief verdict.",
      },
    ],
  });
}

export async function generateKit(
  spec: Record<string, any>,
  market: Record<string, any> | null,
  frameworkIds: string[],
  extraContext = ""
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  const frameworks = await buildFrameworkContext(frameworkIds);
  const system =
    "You are a SaaS marketer creating a pre-launch validation campaign: a landing page, a waitlist, and a " +
    "de-risking pre-sell offer designed to prove real demand with a small budget. Write sharp, specific, " +
    "conversion-focused copy grounded in the real evidence provided. Reuse the real quotes as social proof. " +
    "Money is the strongest signal — make the offer ask for a real commitment.\n\n" +
    "SEO matters: the page must be findable by AND convert ready-to-act searchers. Choose a single bottom-of-funnel, " +
    "commercial-intent primary_keyword (specific long-tail, what an ICP about to act would actually type — not a broad " +
    "head term). Write the seo_title (50-60 chars, keyword front-loaded) and seo_description (150-160 chars, keyword used " +
    "naturally, specific outcome, soft CTA) for the search snippet — these are distinct from the on-page marketing headline. " +
    "Write the faq answers to directly resolve real conversion-blocking objections in plain, specific language so they can " +
    "also be cited by AI search engines." +
    (frameworks ? `\n\n---\n\n${frameworks}` : "") +
    `\n\n${SKIMMABLE_STYLE}` +
    extraContext;

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
