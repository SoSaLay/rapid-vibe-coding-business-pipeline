import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { explainFailure } from "@/lib/agent/deploy-explain";

/**
 * Turn a failed deployment step's raw output into one plain line that says who needs to act.
 * Body: { error, log } → { who: "you" | "agent" | "pipeline", line }.
 */
async function handlePost(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const error = String(b.error ?? "").slice(0, 500);
  const log = String(b.log ?? "").slice(-6000);
  if (!error && !log) return NextResponse.json({ error: "Nothing to explain." }, { status: 400 });
  try {
    return NextResponse.json(await explainFailure(error, log));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't explain it." }, { status: 500 });
  }
}

export const POST = attributed(handlePost);
