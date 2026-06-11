import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";

/** Stage 3: the posting loop's writes — mark a post posted / a launch-checklist item done (and undo). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  if (!state?.plan) return NextResponse.json({ error: "No campaign plan yet — generate it first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const done = body.done !== false; // default: marking done

  if (typeof body.postId === "string") {
    const ids = new Set<string>(state.postedIds ?? []);
    if (done) ids.add(body.postId);
    else ids.delete(body.postId);
    state.postedIds = Array.from(ids);
  } else if (typeof body.checklistId === "string") {
    const ids = new Set<string>(state.checklistDone ?? []);
    if (done) ids.add(body.checklistId);
    else ids.delete(body.checklistId);
    state.checklistDone = Array.from(ids);
  } else {
    return NextResponse.json({ error: "Provide postId or checklistId." }, { status: 400 });
  }

  await savePhaseState(params.id, "marketing-sales", state);
  return NextResponse.json({ postedIds: state.postedIds ?? [], checklistDone: state.checklistDone ?? [] });
}
