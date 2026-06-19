/**
 * Design-engine layer for Product Design — Stage 2 (screen mockups).
 *
 * Stage 2 is pluggable so the same brief can be rendered by different engines:
 *  - `claude-html`  : the original Claude structured-output HTML generator.
 *  - `google-stitch`: Gemini 2.5 driven, prompted Stitch-style (the design-lock
 *                     from Stage 1 + a per-screen Stitch prompt). This is where
 *                     real visual distinctiveness comes from.
 *
 * Both engines honor the SAME contract: in → (brief, screen); out → one
 * self-contained HTML5 document. So the preview route, storage, and UI are
 * engine-agnostic. `activeDesignEngine()` prefers Stitch when Google is
 * connected, else falls back to Claude — never blocks the phase.
 */

import { generateScreenMockup } from "../phases/product-design";
import { loadDesignTaste } from "../design-systems";
import { geminiGenerateText, isGoogleConfigured } from "../google/genai";
import { getProjectSettings } from "../store";

export interface BriefScreen {
  id: string;
  name: string;
  purpose: string;
  primary_action: string;
  key_elements: string[];
  states: { empty: string; loading: string; error: string; success: string };
  responsive_notes: string;
}

export interface DesignEngine {
  id: string;
  name: string;
  isConfigured(): Promise<boolean>;
  /** Produce a complete, self-contained HTML document for one screen. */
  generateScreen(brief: Record<string, any>, screen: BriefScreen): Promise<string>;
}

/* ---------------- Claude engine (existing behavior, always available) ---------------- */

const claudeEngine: DesignEngine = {
  id: "claude-html",
  name: "Claude HTML",
  async isConfigured() {
    return true; // the pipeline's primary LLM is assumed configured by this phase
  },
  generateScreen(brief, screen) {
    return generateScreenMockup(brief, screen);
  },
};

/* ---------------- Stitch-mode engine (Gemini-backed) ---------------- */

/**
 * The Stage-1 design lock, rendered as Stitch's "DESIGN.md" — the cross-screen
 * contract Gemini must obey for visual cohesion (colors, type, shape, voice).
 */
function buildDesignLock(brief: Record<string, any>): string {
  const v = brief.visual || {};
  const b = brief.branding || {};
  const colors = (v.colors || []).map((c: any) => `  - ${c.name}: ${c.hex} (${c.usage})`).join("\n");
  const t = v.typography || {};
  const s = v.spacing_and_shape || {};
  return [
    `# DESIGN LOCK — obey across every screen`,
    ``,
    `Brand: ${b.name || ""} — ${b.tagline || ""}`,
    `Voice: ${b.voice || ""}`,
    `Personality: ${(b.personality || []).join(", ")}`,
    ``,
    `Style: ${v.style || ""}`,
    `Color mode: ${v.mode || "light"}`,
    `Mood to earn: ${v.mood || ""}`,
    ``,
    `Color tokens (use these EXACT hex values, nothing else):`,
    colors || "  (none specified)",
    ``,
    `Typography: headings "${t.heading_font || ""}", body "${t.body_font || ""}", scale ${t.type_scale || ""}`,
    `Spacing: ${s.spacing_scale || ""}`,
    `Radius: ${s.radius || ""}`,
    `Elevation: ${s.elevation || ""}`,
  ].join("\n");
}

/**
 * A single-screen Stitch-style prompt: platform → context → emotional goal →
 * explicit elements → states → theme. (The structure the Stitch guides
 * recommend, fed from the structured brief instead of typed by a human.)
 */
function buildStitchPrompt(brief: Record<string, any>, screen: BriefScreen): string {
  const dos = ((brief.dos_and_donts || {}).dos || []).map((d: string) => `- ${d}`).join("\n");
  const donts = ((brief.dos_and_donts || {}).donts || []).map((d: string) => `- ${d}`).join("\n");
  return [
    `Design ONE responsive web screen: "${screen.name}".`,
    ``,
    `Purpose / user context: ${screen.purpose}`,
    `The single most important action on this screen: ${screen.primary_action}`,
    `Key elements that must appear: ${(screen.key_elements || []).join(", ")}`,
    `Responsive behavior: ${screen.responsive_notes}`,
    ``,
    `States to hint at (show the populated/default state; nod to one non-happy state inline):`,
    `- empty: ${screen.states?.empty || ""}`,
    `- loading: ${screen.states?.loading || ""}`,
    `- error: ${screen.states?.error || ""}`,
    `- success: ${screen.states?.success || ""}`,
    ``,
    dos ? `DO:\n${dos}` : ``,
    donts ? `DON'T:\n${donts}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pull a clean HTML document out of a model response (strip prose / code fences). */
function extractHtml(raw: string): string {
  let t = raw.trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) t = t.slice(start);
  return t.trim();
}

const stitchEngine: DesignEngine = {
  id: "google-stitch",
  name: "Stitch-mode (Gemini)",
  isConfigured: isGoogleConfigured,
  async generateScreen(brief, screen) {
    const taste = await loadDesignTaste();
    const system =
      "You are Google Stitch — a senior product designer that turns a locked design system and a single-screen " +
      "brief into a high-fidelity, production-quality web UI. Output ONE complete, self-contained HTML5 document " +
      "(<!doctype html> … </html>) and NOTHING else — no explanation, no markdown fences. Use Tailwind via " +
      "https://cdn.tailwindcss.com and Google Fonts via <link>. A small amount of inline JavaScript is allowed for " +
      "tasteful animation (scroll-reveal via IntersectionObserver, micro-interactions), plus a lightweight Three.js " +
      "hero accent via CDN where it genuinely fits. Obey the DESIGN LOCK exactly (hex values, fonts, radius, elevation). " +
      "It must look like a real, shipped product: realistic data and microcopy in the brand voice, polished spacing and " +
      "hierarchy, real inline SVG icons (never emoji). Accessibility is non-negotiable: 4.5:1 contrast, 44px touch " +
      "targets, visible labels. Design mobile-first and honor the responsive notes with Tailwind breakpoints.\n\n" +
      "MOTION: make the screen feel alive, not static — purposeful scroll-reveal entrances, hover/press " +
      "micro-interactions, loading shimmer, smooth 150–300ms transitions, a subtle animated gradient or a lightweight " +
      "WebGL hero where it fits. CSS-first, tasteful, never distracting, and ALWAYS wrapped in a " +
      "`@media (prefers-reduced-motion: reduce)` guard that disables it." +
      (taste ? `\n\n---\n\n${taste}` : "");

    const prompt = `${buildDesignLock(brief)}\n\n---\n\n${buildStitchPrompt(brief, screen)}\n\nReturn the complete HTML document for this screen.`;
    const raw = await geminiGenerateText({ system, prompt });
    const html = extractHtml(raw);
    if (!/<html[\s>]/i.test(html)) throw new Error("Stitch-mode did not return a usable HTML document.");
    return html;
  },
};

/* ---------------- Registry + selection ---------------- */

export const designEngines: DesignEngine[] = [stitchEngine, claudeEngine];

function byId(id: string | undefined): DesignEngine | undefined {
  return designEngines.find((e) => e.id === id);
}

/**
 * Resolve the engine for a project:
 *  1. honor the user's stored choice (settings.designEngine) when usable,
 *  2. else auto — Stitch when Google is connected, otherwise Claude.
 * Claude is always available, so a Claude choice always wins; a Stitch choice
 * falls back to Claude until Google is connected.
 */
export async function activeDesignEngine(projectId?: string): Promise<DesignEngine> {
  if (projectId) {
    const chosen = byId((await getProjectSettings(projectId)).designEngine);
    if (chosen && (await chosen.isConfigured())) return chosen;
    if (chosen?.id === claudeEngine.id) return claudeEngine;
  }
  if (await stitchEngine.isConfigured()) return stitchEngine;
  return claudeEngine;
}
