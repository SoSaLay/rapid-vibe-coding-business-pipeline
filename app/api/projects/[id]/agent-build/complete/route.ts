import { NextRequest, NextResponse } from "next/server";
import { saveArtifact, completePhase, getPhaseState } from "@/lib/store";
import { securityPasses, type SecurityReport } from "@/lib/phases/agent-security";
import { loadBuild } from "@/lib/agent/build-context";

/** Record the build-manifest + security-report and unlock Evaluations. Failing tasks need { force: true }; failing safety items must be fixed or signed off. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const body = await req.json().catch(() => ({}));
  const tests = ctx.build?.tests;
  if (!ctx.build || !tests) return NextResponse.json({ error: "Run the tests first." }, { status: 400 });
  const examplesPassing = tests.examples.length > 0 && tests.examples.every((e) => e.passed);
  if ((!tests.ok || !examplesPassing) && !body.force) {
    return NextResponse.json({ error: "Some checks or example tasks failed. Complete anyway to continue." }, { status: 400 });
  }
  const report = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
  if (!report || report.design_version !== ctx.build.design_version) return NextResponse.json({ error: "Run the safety review first." }, { status: 400 });
  if (!securityPasses(report)) return NextResponse.json({ error: "Fix or accept every red safety item first." }, { status: 400 });
  await saveArtifact({ projectId: params.id, phase: "engineering", artifactType: "security-report", payload: report, inputs: ["agent-design", "build-manifest"] });
  const artifact = await saveArtifact({
    projectId: params.id,
    phase: "engineering",
    artifactType: "build-manifest",
    payload: {
      kind: "agent",
      workspace_path: ctx.build.workspace_path,
      framework: "langchain",
      language: "python",
      model: ctx.design?.model.selected,
      files: ctx.build.files,
      tests: { passed: tests.passed, failed: tests.failed, examples: tests.examples },
      forced: !!body.force && (!tests.ok || !examplesPassing),
      run_command: `cd "${ctx.build.workspace_path}" && uv run python -m agent.run "your task"`,
      studio_command: `cd "${ctx.build.workspace_path}" && uv run langgraph dev`,
    },
    inputs: [`agent-design@${ctx.build.design_version}`, "product-spec"],
  });
  const project = ctx.project?.phase_status.engineering === "complete" ? ctx.project : await completePhase(params.id, "engineering");
  return NextResponse.json({ artifact, project }, { status: 201 });
}
