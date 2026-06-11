import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { ManualResponse } from "@/lib/phases/qa";

/** Stage 3: save the human's manual checklist responses (pass / fail / n-a + notes). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "qa");
  if (!state?.plan) return NextResponse.json({ error: "No QA plan yet — generate it first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const responses: ManualResponse[] = Array.isArray(body.responses)
    ? body.responses
        .filter((r: any) => r && typeof r.id === "string" && ["pass", "fail", "na"].includes(r.status))
        .map((r: any) => ({ id: r.id, status: r.status, note: r.note ? String(r.note) : undefined }))
    : [];

  // Merge by id — a re-submitted item replaces its previous answer.
  const merged: ManualResponse[] = [...(state.manual ?? [])];
  for (const r of responses) {
    const i = merged.findIndex((m) => m.id === r.id);
    if (i >= 0) merged[i] = r;
    else merged.push(r);
  }

  await savePhaseState(params.id, "qa", { ...state, manual: merged });
  return NextResponse.json({ manual: merged });
}
