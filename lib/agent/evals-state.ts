/** Evaluations state, kept under the `qa` phase state (the agent pipeline's Evaluations stage reuses that id). */

import { getPhaseState, savePhaseState } from "../store";
import type { EvalSummary, GateCheck } from "../phases/agent-evals";

export interface EvalRun {
  at: string;
  summary: EvalSummary;
  gate: GateCheck[];
  passed: boolean;
  unit: { ok: boolean; passed: number; failed: number };
}

export interface EvalsState {
  dataset_version?: number;
  dataset_counts?: Record<string, number>;
  runs: EvalRun[];
  baseline: EvalSummary | null;
  baseline_at?: string;
}

export async function getEvals(projectId: string): Promise<EvalsState> {
  return (await getPhaseState<EvalsState>(projectId, "qa")) ?? { runs: [], baseline: null };
}

export async function saveEvals(projectId: string, state: EvalsState): Promise<void> {
  await savePhaseState(projectId, "qa", state);
}
