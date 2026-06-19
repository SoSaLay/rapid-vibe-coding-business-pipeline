/**
 * Brand-direction proposer — the "show me the thinking first" step.
 *
 * Before any pixels are generated, the LLM proposes 2-3 distinct creative
 * directions as plain text (vibe, color feel, logo concept, overall UI/landing
 * feel). The user picks one; that choice is stored project-wide and seeded into
 * every downstream image + UI prompt (Pre-Marketing assets → Product Design
 * tokens → Marketing campaign art) so the whole brand stays coherent.
 *
 * Text-only and cheap by design — generation only kicks off after a pick.
 */

import { activeProvider } from "./llm/registry";

export interface BrandDirection {
  id: string;
  name: string;
  vibe: string;
  color_feel: string;
  logo_concept: string;
  ui_feel: string;
  why_fits: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    directions: {
      type: "array",
      description: "Exactly 3 genuinely DIFFERENT creative directions — not three shades of the same idea.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "kebab-case slug, e.g. 'warm-editorial'." },
          name: { type: "string", description: "A short evocative name, e.g. 'Warm Editorial' or 'Clinical Precision'." },
          vibe: { type: "string", description: "One sentence on the overall feeling and personality." },
          color_feel: { type: "string", description: "The palette mood in words (e.g. 'warm creams + a single confident tomato red')." },
          logo_concept: { type: "string", description: "A concrete logo idea a designer could execute." },
          ui_feel: { type: "string", description: "How the landing page + app UI should feel (layout, density, motion)." },
          why_fits: { type: "string", description: "Why this fits THIS product, audience, and positioning." },
        },
        required: ["id", "name", "vibe", "color_feel", "logo_concept", "ui_feel", "why_fits"],
      },
    },
  },
  required: ["directions"],
};

/** Render a chosen direction as a compact prompt fragment for image/UI generation. */
export function directionToPromptFragment(d: Record<string, any> | null | undefined): string {
  if (!d) return "";
  return [
    `Creative direction "${d.name}":`,
    d.vibe ? `vibe — ${d.vibe};` : "",
    d.color_feel ? `colors — ${d.color_feel};` : "",
    d.logo_concept ? `logo concept — ${d.logo_concept};` : "",
    d.ui_feel ? `UI feel — ${d.ui_feel}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Propose 3 distinct directions from whatever product context exists so far. */
export async function proposeBrandDirections(context: string): Promise<BrandDirection[]> {
  const provider = activeProvider();
  const result = await provider.completeJson<{ directions: BrandDirection[] }>({
    system:
      "You are a brand creative director presenting initial directions to a founder BEFORE any design is generated. " +
      "Propose three genuinely distinct directions a brand could take — different enough that picking one is a real " +
      "decision. Each must be concrete and evocative, grounded in the product, audience, and positioning provided. " +
      "No hedging, no 'it depends'. This is the menu the founder chooses from.",
    effort: "medium",
    schema: SCHEMA,
    messages: [{ role: "user", content: `${context}\n\nPropose three distinct brand directions.` }],
  });
  return (result.directions || []).slice(0, 3);
}
