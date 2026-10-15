import { NextRequest, NextResponse } from "next/server";
import { saveArtifact, completePhase } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";

/** Step 4: record the build-manifest and unlock Security. Failing examples need { force: true }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const body = await req.json().catch(() => ({}));
  const tests = ctx.build?.tests;
  if (!ctx.build || !tests) return NextResponse.json({ error: "Run the tests first." }, { status: 400 });
  const examplesPassing = tests.examples.length > 0 && tests.examples.every((e) => e.passed);
  if ((!tests.ok || !examplesPassing) && !body.force) {
    return NextResponse.json({ error: "Some checks or example tasks failed. Complete anyway to continue." }, { status: 400 });
  }
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
