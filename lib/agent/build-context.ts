/**
 * Shared loader for the agent-build routes: the approved design, the spec, the
 * workspace folder and the build state (kept under the engineering phase state).
 */

import { getPhaseState, getProject, latestArtifact, savePhaseState } from "../store";
import { workspacePath, slugify } from "../workspace";
import type { AgentDesign } from "./design";
import type { ExampleResult } from "../phases/agent-engineering";

export interface AgentBuildState {
  design_version: number;
  workspace_path: string;
  files: { path: string; explains: string }[];
  written_at: string;
  committed: boolean;
  /** Env vars the generated tool code reads (credentials beyond the design's own list). */
  env_vars?: string[];
  /** The model-written parts, kept so light changes (skills, knowledge, model, limits) re-render without rewriting code. */
  logic?: import("./types").FilledLogic;
  /** Tool signature the code was written for; a different one needs a full rebuild. */
  tools_signature?: string;
  knowledge?: { chunks: number; problems: string[] };
  install?: { ok: boolean; output: string; at: string; repaired?: boolean };
  tests?: { ok: boolean; passed: number; failed: number; output: string; examples: ExampleResult[]; at: string; skipped_examples: boolean };
}

export async function loadBuild(projectId: string) {
  const project = await getProject(projectId);
  const designArt = await latestArtifact(projectId, "agent-design");
  const specArt = await latestArtifact(projectId, "product-spec");
  const phase = (await getPhaseState<any>(projectId, "engineering")) ?? {};
  const title = project?.title || "Agent";
  return {
    project,
    title,
    slug: slugify(title),
    dir: workspacePath(title),
    design: (designArt?.payload as AgentDesign | undefined) ?? null,
    designVersion: designArt?.version ?? 0,
    spec: (specArt?.payload as Record<string, any> | undefined) ?? null,
    phase,
    build: (phase.agentBuild as AgentBuildState | undefined) ?? null,
  };
}

export async function saveBuild(projectId: string, phase: any, build: AgentBuildState) {
  await savePhaseState(projectId, "engineering", { ...phase, agentBuild: build });
}

/** What the generated code depends on: the tools and their inputs. Anything else is a light change. */
export function toolsSignature(design: import("./design").AgentDesign): string {
  return JSON.stringify(
    design.tools
      .filter((t) => t.enabled)
      .map((t) => [t.name, t.side_effect, t.credential_env, t.integration, t.inputs.map((f) => [f.name, f.type, f.required])])
      .sort()
  );
}
