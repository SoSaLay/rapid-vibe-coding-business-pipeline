import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { activeProvider } from "@/lib/llm/registry";
import { buildAndWriteLanding } from "@/lib/phases/landing-build";

/**
 * AI-chat landing-page editing (#5). The page is rendered deterministically from the
 * validation kit, so an edit = patch the landing-relevant kit fields per the founder's
 * instruction, then re-render. This keeps the Supabase form + structure intact and lets
 * "remove the FAQ" work by emptying that array (the renderer skips empty sections).
 */
const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    positioning: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem_statement: { type: "string" },
        headline: { type: "string" },
        subheadline: { type: "string" },
        benefit_bullets: { type: "array", items: { type: "string" } },
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
        type: { type: "string" },
        headline: { type: "string" },
        details: { type: "string" },
        price_hypothesis: { type: "string" },
      },
      required: ["type", "headline", "details", "price_hypothesis"],
    },
    social_proof: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { quote: { type: "string" }, source: { type: "string" } },
        required: ["quote", "source"],
      },
    },
  },
  required: ["positioning", "offer", "social_proof"],
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const instruction = (body.instruction || "").trim();
  if (!instruction) return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });

  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "Generate the landing page first." }, { status: 400 });

  const kit = state.kit;
  const current = {
    positioning: {
      problem_statement: kit.positioning?.problem_statement ?? "",
      headline: kit.positioning?.headline ?? "",
      subheadline: kit.positioning?.subheadline ?? "",
      benefit_bullets: kit.positioning?.benefit_bullets ?? [],
      faq: kit.positioning?.faq ?? [],
    },
    offer: kit.offer ?? {},
    social_proof: kit.social_proof ?? [],
  };

  try {
    const patch = await activeProvider().completeJson<typeof current>({
      system:
        "You edit the content of a product landing page. You are given the page's current content as JSON and a " +
        "plain-English change request from the founder. Apply ONLY that change and return the COMPLETE updated content " +
        "with every field present. Keep all other copy exactly as-is. To remove a section (e.g. the FAQ or testimonials), " +
        "return an empty array for it. Keep copy tight, concrete, and on-brand — never invent fake testimonials or stats.",
      effort: "medium",
      schema: EDIT_SCHEMA,
      messages: [
        {
          role: "user",
          content: `CURRENT PAGE CONTENT:\n${JSON.stringify(current, null, 2)}\n\nCHANGE REQUEST:\n${instruction}`,
        },
      ],
    });

    // Merge the patch back, preserving non-landing kit fields (seo_*, distribution_plan, etc.).
    const nextKit = {
      ...kit,
      positioning: { ...kit.positioning, ...patch.positioning },
      offer: { ...kit.offer, ...patch.offer },
      social_proof: patch.social_proof,
    };
    await savePhaseState(params.id, "pre-marketing", { ...state, kit: nextKit });
    await buildAndWriteLanding(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't apply that edit. Try rephrasing." }, { status: 500 });
  }
}
