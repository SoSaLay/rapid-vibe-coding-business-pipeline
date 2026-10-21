/** Evaluations state, kept under the `qa` phase state (the agent pipeline's Evaluations stage reuses that id). */

import { getPhaseState, savePhaseState } from "../store";
import type { EvalSummary, GateCheck } from "../phases/agent-evals";

export interface CaseOverride {
  removed?: boolean;
  expected?: string;
  fixtures?: Record<string, string | string[]>;
  /** Why it changed (shown in the case list). */
  why?: string;
  at: string;
}

export interface EvalRun {
  at: string;
  summary: EvalSummary;
  gate: GateCheck[];
  passed: boolean;
  unit: { ok: boolean; passed: number; failed: number };
  /** "live": the deployed testing agent's check (regression + attack cases only), for this release. */
  source?: "local" | "live";
  release?: string;
  /** Code fingerprint the run tested (lib/agent/code-fp.ts). */
  code_fp?: string;
  /** Every test case ran (not a re-test of only what was fixed). */
  full?: boolean;
  /** A practice run: the cheaper model it used instead of the agent's own. */
  practice?: string;
  /** Where the agent ran: our way (unset), or its build on Claude / ChatGPT. */
  platform?: "claude" | "chatgpt";
}

export interface EvalsState {
  dataset_version?: number;
  dataset_counts?: Record<string, number>;
  runs: EvalRun[];
  baseline: EvalSummary | null;
  baseline_at?: string;
  /** The first passing run on each hosted platform (a Claude or ChatGPT build is compared with its own). */
  hosted_baselines?: Partial<Record<"claude" | "chatgpt", EvalSummary>>;
  /** Fix it on a kind of case or a gate rule, since the last run: key → what the AI changed. Cleared by the next run. */
  fixes?: Record<string, { summary: string; at: string; verified?: boolean; tries?: number }>;
  /**
   * The owner's (or a fix's) changes to test cases, kept so a new dataset version or a rebuild doesn't undo
   * them. Keyed by case id, or "example:<the example task's wording>" for cases that come from example tasks.
   */
  case_overrides?: Record<string, CaseOverride>;
  /** Cached explanations for Fix it (so reopening one doesn't cost another AI call). Cleared by the next run. */
  proposals?: Record<string, { explanation: string; plan: string; fixable: boolean }>;
}

export async function getEvals(projectId: string): Promise<EvalsState> {
  return (await getPhaseState<EvalsState>(projectId, "qa")) ?? { runs: [], baseline: null };
}

export async function saveEvals(projectId: string, state: EvalsState): Promise<void> {
  await savePhaseState(projectId, "qa", state);
}
