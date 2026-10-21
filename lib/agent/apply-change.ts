/**
 * Apply a change to a BUILT agent without a full rewrite: record the new design as the
 * approved version, re-render the codebase from the (possibly edited) logic, commit it,
 * and reinstall when tool code changed. Shared by safety "Fix it" and the Automatic Agent Changer.
 * Only valid when the tools' signature is unchanged (new/removed tools need a full rebuild).
 */

import { getPhaseState, savePhaseState, saveArtifact } from "../store";
import { scheduleHostedSync } from "./hosted/sync";
import { saveBuild, type loadBuild } from "./build-context";
import { renderAgent } from "./render";
import { writeCodebase } from "../phases/agent-engineering";
import { uvSync } from "./adapters/pytest-uv";
import { getDeploy } from "./deploy";
import { deployFiles } from "./adapters/deploy-files";
import type { AgentDesign } from "./design";
import type { FilledLogic } from "./types";

type Ctx = Awaited<ReturnType<typeof loadBuild>>;

/** Save `design` as the new approved version (Engineering builds only approved versions). */
export async function approveDesign(projectId: string, design: AgentDesign): Promise<number> {
  const { approved_at: _ignored, ...plain } = design as AgentDesign & { approved_at?: string };
  const art = await saveArtifact({
    projectId,
    phase: "agent-design",
    artifactType: "agent-design",
    payload: { ...plain, approved_at: new Date().toISOString() },
    inputs: ["product-spec"],
  });
  const ds = (await getPhaseState<any>(projectId, "agent-design")) ?? {};
  await savePhaseState(projectId, "agent-design", { ...ds, design: plain, approved: true, approved_version: art.version });
  scheduleHostedSync(projectId);
  return art.version;
}

export async function applyToBuild(args: {
  projectId: string;
  ctx: Ctx;
  design: AgentDesign;
  logic: FilledLogic;
  message: string;
  /** Tool code changed: reinstall packages. */
  reinstall: boolean;
  /** Keep the last test results (a safety fix) or clear them so the agent is re-tested. */
  keepTests: boolean;
}): Promise<number> {
  const { projectId, ctx, design, logic } = args;
  if (!ctx.build || !ctx.spec) throw new Error("Build the agent first.");
  const version = await approveDesign(projectId, design);
  const { files, knowledge } = await renderAgent({ projectId, title: ctx.title, design, spec: ctx.spec, logic });
  const deployState = await getDeploy(projectId);
  if (deployState.prepared_at) files.push(...deployFiles({ title: ctx.title, design, host: deployState.host ?? "agentcore" }));
  await writeCodebase(ctx.dir, files, args.message);
  const sync = args.reinstall ? await uvSync(ctx.dir) : null;
  await saveBuild(projectId, ctx.phase, {
    ...ctx.build,
    design_version: version,
    logic,
    files: files.filter((f) => f.explains).map((f) => ({ path: f.path, explains: f.explains })),
    written_at: new Date().toISOString(),
    knowledge: knowledge ?? ctx.build.knowledge,
    ...(sync ? { install: { ok: sync.ok, output: sync.output, at: new Date().toISOString() } } : {}),
    ...(args.keepTests ? {} : { tests: undefined }),
  });
  return version;
}
