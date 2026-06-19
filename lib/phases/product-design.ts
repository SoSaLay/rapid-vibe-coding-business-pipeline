/**
 * Phase 5 — Product Design.
 *
 * Consumes product-spec (+ market-report and the Pre-Marketing kit when present)
 * and produces the design-spec: branding, UX direction (screens with states +
 * responsive notes), visual direction grounded in a reference design system,
 * component inventory, and do's/don'ts — the exact input Phase 6's architect
 * and coding agent build from.
 *
 * Stage 1 (`generateDesignBrief`): pick 1–2 reference systems from the vendored
 * 138-system library, then synthesize the brief constrained by the ui-ux-pro-max
 * hard-rules playbook.
 * Stage 2 (`generateScreenMockup`): per-screen self-contained Tailwind-CDN HTML
 * mockups using the Stage-1 tokens, sharpened by the design-taste layer.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { buildFrameworkContext } from "../frameworks";
import { designSystemCatalog, buildDesignSystemContext, loadDesignTaste } from "../design-systems";

export interface DesignDirection {
  system_ids: string[];
  rationale: string;
}

const DIRECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    system_ids: { type: "array", items: { type: "string" }, description: "1-2 reference system ids, best fit first." },
    rationale: { type: "string" },
  },
  required: ["system_ids", "rationale"],
};

/** Pick the 1–2 reference design systems that best fit this product. */
export async function selectDesignDirection(context: string): Promise<DesignDirection> {
  const catalog = await designSystemCatalog();
  if (catalog.length === 0) return { system_ids: [], rationale: "" };
  const menu = catalog.map((s) => `- ${s.id} (${s.category}): ${s.description}`).join("\n");
  const provider = activeProvider();
  const result = await provider.completeJson<DesignDirection>({
    system:
      "You are a senior product designer choosing which reference design system(s) should ground a new product's " +
      "visual direction. Pick 1-2 that genuinely fit the product's domain, audience, and tone — not the trendiest.\n\n" +
      "Reference systems (id (category): feel):\n\n" +
      menu,
    effort: "low",
    schema: DIRECTION_SCHEMA,
    messages: [{ role: "user", content: `${context}\n\nChoose the best-fitting reference system ids.` }],
  });
  const valid = new Set(catalog.map((s) => s.id));
  return {
    system_ids: (result.system_ids || []).filter((id) => valid.has(id)).slice(0, 2),
    rationale: result.rationale || "",
  };
}

const SCREEN_STATES = {
  type: "object",
  additionalProperties: false,
  properties: {
    empty: { type: "string", description: "What shows when there's no data yet (first-run)." },
    loading: { type: "string", description: "Loading treatment (skeleton, spinner, optimistic…)." },
    error: { type: "string", description: "What the user sees and can do when this screen fails." },
    success: { type: "string", description: "Confirmation/feedback after the primary action succeeds." },
  },
  required: ["empty", "loading", "error", "success"],
};

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    branding: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "The product name. Reuse the existing one unless it's clearly weak." },
        name_rationale: { type: "string", description: "Why this name (or why the existing one was kept)." },
        tagline: { type: "string", description: "≤8 words, sits under the logo." },
        personality: { type: "array", items: { type: "string" }, description: "3-5 brand adjectives." },
        voice: { type: "string", description: "One line on how the product talks (aligned with Phase-4 positioning if present)." },
        logo_direction: { type: "string", description: "Concrete direction a designer/AI could execute: mark style, type treatment, color." },
      },
      required: ["name", "name_rationale", "tagline", "personality", "voice", "logo_direction"],
    },
    ux: {
      type: "object",
      additionalProperties: false,
      properties: {
        target_user_summary: { type: "string" },
        core_jobs: { type: "array", items: { type: "string" }, description: "The 2-4 jobs users hire this product for." },
        information_architecture: { type: "string", description: "Navigation model + how content is organized, in prose." },
        screens: {
          type: "array",
          description: "Every screen the MVP needs, in rough flow order.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", description: "kebab-case slug, e.g. 'dashboard'." },
              name: { type: "string" },
              purpose: { type: "string", description: "What this screen must accomplish." },
              primary_action: { type: "string", description: "THE one action this screen drives." },
              key_elements: { type: "array", items: { type: "string" } },
              states: SCREEN_STATES,
              responsive_notes: { type: "string", description: "How this screen adapts mobile ↔ desktop, one line." },
              is_key_screen: { type: "boolean", description: "True for the 2-4 screens worth mocking up." },
            },
            required: ["id", "name", "purpose", "primary_action", "key_elements", "states", "responsive_notes", "is_key_screen"],
          },
        },
        flows: {
          type: "array",
          description: "The 2-3 critical user flows as screen-to-screen step lists.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              steps: { type: "array", items: { type: "string" } },
            },
            required: ["name", "steps"],
          },
        },
      },
      required: ["target_user_summary", "core_jobs", "information_architecture", "screens", "flows"],
    },
    visual: {
      type: "object",
      additionalProperties: false,
      properties: {
        mood: { type: "string", description: "The adjective the design must earn, e.g. 'precise', 'warm', 'expensive'." },
        mode: { type: "string", enum: ["dark", "light", "both"], description: "Primary color mode." },
        style: { type: "string", description: "Named UI style from the playbook (e.g. minimalism, glassmorphism, bento grid)." },
        colors: {
          type: "array",
          description: "The exact palette. Every color the app uses, hex values, with usage rules.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Token name, e.g. 'primary', 'surface', 'text-muted'." },
              hex: { type: "string" },
              usage: { type: "string" },
            },
            required: ["name", "hex", "usage"],
          },
        },
        typography: {
          type: "object",
          additionalProperties: false,
          properties: {
            heading_font: { type: "string", description: "Google Font name." },
            body_font: { type: "string", description: "Google Font name." },
            type_scale: { type: "string", description: "e.g. '12/14/16/20/24/32'." },
          },
          required: ["heading_font", "body_font", "type_scale"],
        },
        spacing_and_shape: {
          type: "object",
          additionalProperties: false,
          properties: {
            spacing_scale: { type: "string", description: "e.g. '8pt baseline grid'." },
            radius: { type: "string", description: "Corner radius direction, e.g. 'rounded-lg (8px) everywhere, pills for tags'." },
            elevation: { type: "string", description: "Shadow/depth rules." },
          },
          required: ["spacing_scale", "radius", "elevation"],
        },
      },
      required: ["mood", "mode", "style", "colors", "typography", "spacing_and_shape"],
    },
    components: {
      type: "array",
      description: "The reusable component inventory Phase 6 must build.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string", description: "Anatomy + variants in one or two lines." },
          used_on: { type: "array", items: { type: "string" }, description: "Screen ids that use it." },
        },
        required: ["name", "description", "used_on"],
      },
    },
    dos_and_donts: {
      type: "object",
      additionalProperties: false,
      description: "Short anti-slop rules the Phase-6 coding agent reads verbatim before generating any UI.",
      properties: {
        dos: { type: "array", items: { type: "string" } },
        donts: { type: "array", items: { type: "string" } },
      },
      required: ["dos", "donts"],
    },
    open_risks: {
      type: "array",
      items: { type: "string" },
      description: "Design decisions a human should eyeball before the build (tricky flows, dense screens, a11y hot spots).",
    },
  },
  required: ["branding", "ux", "visual", "components", "dos_and_donts", "open_risks"],
};

function specToText(spec: Record<string, any>): string {
  const f = (arr: any[]) => (Array.isArray(arr) ? arr.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Value proposition: ${spec.value_proposition || ""}`,
    `Must-have features: ${(spec.must_have_features || []).map((x: any) => `${x.name}: ${x.description || ""}`).join("; ")}`,
    `Nice-to-haves: ${(spec.nice_to_have_features || []).map((x: any) => x.name).join("; ")}`,
    ideaTypeContext(spec.idea_type),
  ].join("\n");
}

function marketToText(market: Record<string, any> | null): string {
  if (!market) return "(no market report — Market Researcher was skipped)";
  return [
    `Positioning hint: ${market.positioning || ""}`,
    `Target segments: ${(market.target_segments || []).map((s: any) => s.segment).join("; ")}`,
    `Competitors: ${(market.competitive_landscape || []).map((c: any) => c.name).join(", ")}`,
  ].join("\n");
}

function kitToText(kit: Record<string, any> | null): string {
  if (!kit) return "(no pre-marketing kit — phase was skipped)";
  const p = kit.positioning || {};
  return [
    `Validated headline: ${p.headline || ""}`,
    `Subheadline: ${p.subheadline || ""}`,
    `Problem statement: ${p.problem_statement || ""}`,
  ].join("\n");
}

/** Stage 1: synthesize the design brief (the design-spec payload). */
export async function generateDesignBrief(
  spec: Record<string, any>,
  market: Record<string, any> | null,
  kit: Record<string, any> | null,
  systemIds: string[],
  productTitle: string,
  brandDirection?: Record<string, any> | null
): Promise<Record<string, unknown>> {
  const provider = activeProvider();
  const [rules, reference] = await Promise.all([
    buildFrameworkContext(["ui-ux-pro-max"]),
    buildDesignSystemContext(systemIds),
  ]);
  const system =
    "You are a senior product designer producing the design specification an AI coding agent will build from. " +
    "Be concrete and decisive: exact hex values, named fonts, specific screen lists — never 'choose an appropriate color'. " +
    "Structure before style: get users, jobs, screens, and flows right, then make the visuals serve them. " +
    "Every screen MUST define its empty/loading/error/success states — the coding agent builds only what is written. " +
    "Branding: if the product already has a name and validated positioning, keep and build on them; only propose a new " +
    "name if the current one is clearly weak, and say why either way." +
    (rules ? `\n\n---\n\n${rules}` : "") +
    (reference ? `\n\n---\n\n${reference}` : "");

  const directionBlock = brandDirection
    ? `CHOSEN BRAND DIRECTION (the founder already picked this — honor it in palette, type, logo, and overall feel):\n` +
      `${brandDirection.name || ""}: ${brandDirection.vibe || ""} | colors: ${brandDirection.color_feel || ""} | ` +
      `logo: ${brandDirection.logo_concept || ""} | UI feel: ${brandDirection.ui_feel || ""}\n\n`
    : "";

  return provider.completeJson<Record<string, unknown>>({
    system,
    effort: "high",
    schema: BRIEF_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `WORKING TITLE: ${productTitle}\n\nPRODUCT SPEC:\n${specToText(spec)}\n\n` +
          `MARKET RESEARCH:\n${marketToText(market)}\n\n` +
          `PRE-MARKETING (validated positioning):\n${kitToText(kit)}\n\n` +
          directionBlock +
          "Produce the design spec.",
      },
    ],
  });
}

const MOCKUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    html: {
      type: "string",
      description:
        "A complete, self-contained HTML5 document for this one screen: <!doctype html> through </html>. " +
        "Tailwind via https://cdn.tailwindcss.com, fonts via Google Fonts <link>. A small amount of inline " +
        "JavaScript IS allowed for tasteful animation (scroll-reveal via IntersectionObserver, micro-interactions); " +
        "a lightweight Three.js hero accent via CDN is allowed only where it genuinely fits. Realistic content — never lorem ipsum.",
    },
  },
  required: ["html"],
};

interface BriefScreen {
  id: string;
  name: string;
  purpose: string;
  primary_action: string;
  key_elements: string[];
  states: { empty: string; loading: string; error: string; success: string };
  responsive_notes: string;
}

/** Stage 2: one self-contained HTML mockup for one screen, regenerable independently. */
export async function generateScreenMockup(
  brief: Record<string, any>,
  screen: BriefScreen
): Promise<string> {
  const provider = activeProvider();
  const taste = await loadDesignTaste();
  const visual = brief.visual || {};
  const branding = brief.branding || {};

  const system =
    "You are a senior product designer producing a high-fidelity static HTML mockup of ONE screen. " +
    "It must look like a real, shipped product — realistic data, real microcopy in the brand voice, " +
    "polished spacing and hierarchy. Obey the design tokens EXACTLY (hex values, fonts, radius, elevation). " +
    "Honor the responsive notes with Tailwind breakpoints (design mobile-first). " +
    "Accessibility is non-negotiable: 4.5:1 contrast, 44px touch targets, visible labels, real SVG icons (never emoji).\n\n" +
    "MOTION: the screen must feel alive, not static. Add purposeful, performant animation where it helps — " +
    "scroll-reveal entrances (IntersectionObserver), hover/press micro-interactions, loading shimmer/skeletons, " +
    "smooth 150–300ms transitions, and a subtle animated gradient or (where it truly fits) a lightweight Three.js/WebGL " +
    "hero accent. CSS-first; keep it tasteful, never distracting. ALWAYS wrap motion in a " +
    "`@media (prefers-reduced-motion: reduce)` guard that disables it." +
    (taste ? `\n\n---\n\n${taste}` : "");

  const result = await provider.completeJson<{ html: string }>({
    system,
    effort: "medium",
    schema: MOCKUP_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `BRAND: ${branding.name || ""} — ${branding.tagline || ""}\nVoice: ${branding.voice || ""}\n` +
          `Personality: ${(branding.personality || []).join(", ")}\n\n` +
          `DESIGN TOKENS (obey exactly):\n${JSON.stringify(visual, null, 2)}\n\n` +
          `DO:\n${((brief.dos_and_donts || {}).dos || []).map((d: string) => `- ${d}`).join("\n")}\n` +
          `DON'T:\n${((brief.dos_and_donts || {}).donts || []).map((d: string) => `- ${d}`).join("\n")}\n\n` +
          `SCREEN TO MOCK UP:\n${JSON.stringify(screen, null, 2)}\n\n` +
          "Produce the complete HTML document for this screen's default (populated) state. " +
          "Where it fits naturally, hint at one non-happy state from the spec (e.g. an inline empty-state panel or a toast).",
      },
    ],
  });
  return result.html;
}
