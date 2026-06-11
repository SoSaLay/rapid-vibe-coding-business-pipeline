import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import {
  parseDeployResults,
  verifyEnvironments,
  evaluateDeployExit,
  DEPLOY_RESULTS_PATH,
} from "@/lib/phases/deployment";
import { readWorkspaceFile } from "@/lib/workspace";

/** Stage 4 — sign-off: verify the live environments → deploy-manifest artifact, complete the phase. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "deployment");
  if (!state?.plan) return NextResponse.json({ error: "No deploy plan yet — generate it first." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  const body = await req.json().catch(() => ({}));

  const raw = await readWorkspaceFile(title, DEPLOY_RESULTS_PATH);
  const results = raw ? parseDeployResults(raw) : null;
  const verifications = results ? await verifyEnvironments(results.environments) : [];
  const exit = evaluateDeployExit(results, verifications);
  if (!exit.ready && !body.force) {
    return NextResponse.json(
      { error: "Deployment not verified. Pass force to sign off anyway.", blockers: exit.blockers },
      { status: 400 }
    );
  }

  const forced = !exit.ready && !!body.force;
  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "deployment",
      artifactType: "deploy-manifest",
      payload: {
        target: state.target || "amplify",
        options: state.options || { waf: false, domain: null },
        app_id: results?.app_id ?? null,
        region: results?.region ?? null,
        repo_url: results?.repo_url ?? null,
        environments: results?.environments ?? [],
        waf: results?.waf ?? null,
        domain: results?.domain ?? null,
        verification: verifications,
        agent_blockers: results?.blockers ?? [],
        human_todos: state.plan?.human_todos ?? [],
        notes: state.plan?.notes ?? [],
        forced,
        blockers_at_signoff: forced ? exit.blockers : [],
      },
      inputs: ["build-manifest", "qa-report"],
      status: "complete",
    });
    const updated = await completePhase(params.id, "deployment");
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to complete deployment." }, { status: 500 });
  }
}
