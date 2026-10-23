import { NextRequest, NextResponse } from "next/server";
import { localStatus, startLocal, stopLocal } from "@/lib/agent/local";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";
import { loadBuild } from "@/lib/agent/build-context";
import { isPersonal, parseBasics } from "@/lib/agent/basics";
import { completePhase, getProject } from "@/lib/store";

/** The agent on this computer: is it running, and where. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const [status, s, ctx] = await Promise.all([localStatus(params.id), getDeploy(params.id), loadBuild(params.id)]);
  const basics = parseBasics(ctx.design?.basics ?? ctx.spec?.agent?.basics);
  return NextResponse.json({
    ...status,
    /** "Just me": running here is the release; going online is optional. */
    personal: !!basics && isPersonal(basics),
    /** Tested on this computer at least once (unlocks the online steps), or already set up online before this existed. */
    tested: !!s.local || !!s.prepared_at,
    online: !!s.online,
  });
}

/**
 * Body: { action: "start" | "stop" | "online" }.
 * "online" is for "Just me" agents whose owner also wants it online: it shows Deployment's online steps.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === "stop") {
      await stopLocal(params.id);
      return NextResponse.json(await localStatus(params.id));
    }
    if (action === "online") {
      await saveDeploy(params.id, { ...(await getDeploy(params.id)), online: true });
      return NextResponse.json({ ok: true });
    }
    if (action !== "start") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const status = await startLocal(params.id, req.nextUrl.origin);
    // "Just me" agents end here: running on this computer is their release.
    const [ctx, project] = await Promise.all([loadBuild(params.id), getProject(params.id)]);
    const basics = parseBasics(ctx.design?.basics ?? ctx.spec?.agent?.basics);
    if (basics && isPersonal(basics) && project?.phase_status.deployment !== "complete") await completePhase(params.id, "deployment");
    return NextResponse.json(status);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "That didn't work.", log: e?.log }, { status: 500 });
  }
}
