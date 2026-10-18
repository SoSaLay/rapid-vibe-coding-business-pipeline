import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { synthesizeIteration, CheckinQuestion } from "@/lib/phases/iteration";

/** Stage 2: answers → honest traction read + ranked next moves. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const answers: Record<string, string> = body.answers ?? {};

  const state = await getPhaseState<any>(params.id, "iteration");
  if (!state?.questions?.length) {
    return NextResponse.json({ error: "No check-in yet — start one first." }, { status: 400 });
  }
  const questions: CheckinQuestion[] = state.questions;
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;
  if (answeredCount === 0) {
    return NextResponse.json({ error: "Answer at least one question before synthesizing." }, { status: 400 });
  }

  try {
    const brief = await synthesizeIteration(state.context ?? "", questions, answers);
    await savePhaseState(params.id, "iteration", { ...state, answers, brief });
    return NextResponse.json({ brief }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to synthesize the iteration brief." }, { status: 500 });
  }
}
