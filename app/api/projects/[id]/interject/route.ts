import { NextRequest, NextResponse } from "next/server";
import { activeProvider } from "@/lib/llm/registry";
import { addInterjection, listInterjections } from "@/lib/interjections";
import { latestArtifact } from "@/lib/store";
import { getPhase } from "@/lib/pipeline";

/** List the refined interjections already recorded for a phase. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const phase = req.nextUrl.searchParams.get("phase") || "";
  return NextResponse.json({ interjections: await listInterjections(params.id, phase) });
}

const REFINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    refined: {
      type: "string",
      description: "The business owner's intent as one clean, actionable directive for the phase's generation agent.",
    },
  },
  required: ["refined"],
};

/**
 * Business-owner interjection (#8). The owner submits a raw note for a phase; the
 * Product Owner translates it into a clean directive (never bypassing the PO filter),
 * which is stored and injected into that phase's next generation call.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const phase = (body.phase || "").trim();
  const note = (body.note || "").trim();
  if (!phase || !note) return NextResponse.json({ error: "Missing phase or note." }, { status: 400 });

  const phaseDef = getPhase(phase as any);
  const spec = (await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any> | undefined;

  try {
    const { refined } = await activeProvider().completeJson<{ refined: string }>({
      system:
        "You are a Product Owner. The business owner has dropped a raw note to steer the " +
        `"${phaseDef?.name || phase}" phase of building their product. Translate their intent into ONE clean, ` +
        "specific, actionable directive the phase's generation agent can follow. Preserve the owner's intent and " +
        "priorities; sharpen vague language into something concrete; do not add scope they didn't ask for. Keep it to " +
        "1-2 sentences, imperative voice.",
      effort: "low",
      schema: REFINE_SCHEMA,
      messages: [
        {
          role: "user",
          content:
            (spec?.summary ? `PRODUCT CONTEXT: ${spec.summary}\n\n` : "") +
            `BUSINESS OWNER'S RAW NOTE:\n${note}`,
        },
      ],
    });

    const saved = await addInterjection(params.id, phase, { raw: note, refined });
    return NextResponse.json({ interjection: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't process that note." }, { status: 500 });
  }
}
