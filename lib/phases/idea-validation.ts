/**
 * Phase 3 — Market Researcher (Idea Validation).
 *
 * Merged phase: real demand signal + market research in one pre-build gate.
 *   1. plan   — Claude turns the spec into (a) forum-style PROBLEM queries +
 *               idea-relevant community domains, and (b) MARKET queries to find
 *               competitors / comparisons / market data (open web).
 *   2. gather — Exa runs both passes (recent) → real forum voices + market sources.
 *   3. verdict— Claude synthesizes demand themes/quotes AND market research
 *               (competitive landscape, sizing, segments, positioning) into a
 *               single market-report with a build/refine/reject/archive verdict.
 * Reuses pm-skills playbooks for both validation and market research.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { buildFrameworkContext } from "../frameworks";
import { exaSearch, ExaResult } from "../exa";

export interface SearchPlan {
  queries: string[];
  domains: string[];
  market_queries: string[];
  rationale: string;
}

export interface ValidationEvidence {
  kind: "forum" | "market";
  title: string;
  url: string;
  publishedDate?: string;
  summary?: string;
  highlight?: string;
}

// pm-skills playbooks that sharpen this phase (validation + market research).
const RESEARCH_FRAMEWORKS = [
  "pre-mortem",
  "swot-analysis",
  "identify-assumptions-new",
  "competitor-analysis",
  "market-sizing",
  "market-segments",
];

function specToText(spec: Record<string, any>): string {
  const f = (arr: any[]) => (Array.isArray(arr) ? arr.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Value proposition: ${spec.value_proposition || ""}`,
    `Must-have features: ${(spec.must_have_features || []).map((x: any) => x.name).join("; ")}`,
    ideaTypeContext(spec.idea_type),
  ].join("\n");
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      description:
        "4-6 search queries phrased the way real people complain/ask online about the PROBLEM (not the solution). Natural language, e.g. 'anyone else struggle with X', 'is there a tool that Y'.",
      items: { type: "string" },
    },
    domains: {
      type: "array",
      description:
        "4-10 forum/community hostnames where THIS idea's audience hangs out (e.g. quora.com, news.ycombinator.com, indiehackers.com, 7cups.com, mumsnet.com, stackexchange.com). Do NOT include reddit.com.",
      items: { type: "string" },
    },
    market_queries: {
      type: "array",
      description:
        "3-5 queries to surface the MARKET: competitors, comparison articles, category overviews, pricing, market size. e.g. 'best <category> tools 2026', '<category> software comparison', '<problem> market size'.",
      items: { type: "string" },
    },
    rationale: { type: "string", description: "One sentence on why these communities/searches fit this idea." },
  },
  required: ["queries", "domains", "market_queries", "rationale"],
};

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["build", "refine", "reject", "archive"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    demand_signal: { type: "integer", description: "0-10: how strong/real the demand evidence is." },
    summary: { type: "string", description: "What people are saying + the market picture, in 2-4 sentences." },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { theme: { type: "string" }, detail: { type: "string" } },
        required: ["theme", "detail"],
      },
    },
    representative_quotes: {
      type: "array",
      description: "Real quotes/paraphrases grounded in the evidence, each with its source URL.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { quote: { type: "string" }, source: { type: "string" }, url: { type: "string" } },
        required: ["quote", "source", "url"],
      },
    },
    sentiment: { type: "string" },
    pain_intensity: { type: "string" },
    market_overview: { type: "string", description: "The category, where it's heading, and demand maturity." },
    market_size: { type: "string", description: "Qualitative TAM/SAM/SOM read with the reasoning behind it." },
    competitive_landscape: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          positioning: { type: "string" },
          strengths: { type: "string" },
          gaps: { type: "string", description: "Where they fall short — the opening for this idea." },
        },
        required: ["name", "positioning", "strengths", "gaps"],
      },
    },
    target_segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { segment: { type: "string" }, description: { type: "string" } },
        required: ["segment", "description"],
      },
    },
    positioning: { type: "string", description: "Recommended differentiation / how to position against the field." },
    pricing_signal: { type: "string", description: "What the market suggests about willingness to pay / pricing." },
    what_must_be_true: { type: "array", items: { type: "string" } },
    key_risks: { type: "array", items: { type: "string" } },
    kill_criteria: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
  },
  required: [
    "verdict",
    "confidence",
    "demand_signal",
    "summary",
    "themes",
    "representative_quotes",
    "sentiment",
    "pain_intensity",
    "market_overview",
    "market_size",
    "competitive_landscape",
    "target_segments",
    "positioning",
    "pricing_signal",
    "what_must_be_true",
    "key_risks",
    "kill_criteria",
    "recommendation",
  ],
};

export async function planSearches(spec: Record<string, any>): Promise<SearchPlan> {
  const provider = activeProvider();
  const result = await provider.completeJson<SearchPlan>({
    system:
      "You are planning research for a product idea. Plan TWO kinds of searches: " +
      "(1) forum searches for the PROBLEM in real people's words, in the communities this specific audience uses (Reddit is not searchable — exclude it); " +
      "(2) market searches to find competitors, comparison articles, and market data.",
    effort: "medium",
    schema: PLAN_SCHEMA,
    messages: [{ role: "user", content: `PRODUCT SPEC:\n${specToText(spec)}\n\nPlan the searches.` }],
  });
  result.domains = (result.domains || []).filter((d) => !/(^|\.)reddit\.com$/i.test(d));
  return result;
}

export async function gatherEvidence(plan: SearchPlan, problem: string): Promise<ValidationEvidence[]> {
  const focus = `What problem, frustration, opinion, workaround, competitor, or pricing detail about "${problem}" is expressed here?`;
  const seen = new Set<string>();
  const evidence: ValidationEvidence[] = [];

  const push = (results: ExaResult[], kind: "forum" | "market") => {
    for (const r of results) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      evidence.push({
        kind,
        title: r.title,
        url: r.url,
        publishedDate: r.publishedDate,
        summary: r.summary,
        highlight: r.highlights?.[0],
      });
    }
  };

  // Forum/community passes (demand signal).
  for (const query of plan.queries.slice(0, 6)) {
    try {
      push(await exaSearch({ query, domains: plan.domains, numResults: 5, summaryFocus: focus }), "forum");
    } catch {
      /* keep going */
    }
  }
  // Market/competitor passes (open web).
  for (const query of (plan.market_queries || []).slice(0, 5)) {
    try {
      push(await exaSearch({ query, numResults: 5, summaryFocus: focus }), "market");
    } catch {
      /* keep going */
    }
  }

  return evidence.slice(0, 32);
}

function evidenceToText(evidence: ValidationEvidence[]): string {
  return evidence
    .map(
      (e, i) =>
        `[${i + 1}] (${e.kind}) ${e.title} (${e.publishedDate?.slice(0, 10) || "n/a"})\n${e.url}\n${
          e.summary || e.highlight || ""
        }`
    )
    .join("\n\n");
}

export async function synthesizeValidation(
  spec: Record<string, any>,
  evidence: ValidationEvidence[],
  extraContext = ""
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  const frameworks = await buildFrameworkContext(RESEARCH_FRAMEWORKS);
  const system =
    "You are a market researcher validating a product idea using REAL online evidence. " +
    "Evidence is tagged (forum) for demand signal and (market) for competitors/sizing. " +
    "Ground every theme, quote, and competitor in the provided sources (cite URLs). Be honest and skeptical: " +
    "if demand is thin or the market is crowded with happy users, reflect that in a low demand_signal and a cautious verdict. " +
    "Do not invent posts, competitors, or numbers — only what the evidence supports." +
    (frameworks ? `\n\n---\n\n${frameworks}` : "") +
    extraContext;

  return provider.completeJson<Record<string, unknown>>({
    system,
    effort: "high",
    schema: REPORT_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `PRODUCT SPEC:\n${specToText(spec)}\n\n` +
          `ONLINE EVIDENCE:\n${evidenceToText(evidence)}\n\n` +
          "Deliver the combined market research + validation report. If evidence is weak, say so honestly.",
      },
    ],
  });
}
