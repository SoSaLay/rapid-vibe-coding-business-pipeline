import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { runAndSaveSafetyReview } from "@/lib/agent/safety-review";
import { loadBuild } from "@/lib/agent/build-context";

/** Step 4 of the build: the safety review (security checklist + threat model). */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const report = await runAndSaveSafetyReview(params.id);
    return NextResponse.json({ report, build: (await loadBuild(params.id)).build });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Safety review failed." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Reviewing safety", handlePost);
