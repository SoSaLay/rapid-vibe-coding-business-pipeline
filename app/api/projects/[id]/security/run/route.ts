import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { runAndSaveSafetyReview } from "@/lib/agent/safety-review";

/** Run the threat model + checklist against the approved design and the built code. */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ report: await runAndSaveSafetyReview(params.id) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Safety review failed." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Reviewing safety", handlePost);
