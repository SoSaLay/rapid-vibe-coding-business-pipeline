/**
 * Display-status layer for the CI/CD-style pipeline UI.
 *
 * Both the stage strip and the summary read from here so the chip shown for a phase is
 * computed in exactly one place. It translates the stored `PhaseState` (lib/store.ts) plus
 * the set of artifacts that currently exist into a CI/CD chip, and — for not-yet-started
 * phases — decides "ready" vs "blocked" from the HARD_PREREQ gate (lib/pipeline.ts).
 */
import { HARD_PREREQ, PHASES, phaseProducing, type PhaseDef, type PhaseId } from "./pipeline";

export type Chip = "done" | "active" | "ready" | "blocked" | "skipped";

/** Stored phase states (mirrors lib/store.ts `PhaseState`). */
type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

export interface PhaseDisplay {
  chip: Chip;
  /** Human sentence shown when chip === "blocked", else undefined. */
  blockedReason?: string;
}

export const CHIP_LABEL: Record<Chip, string> = {
  done: "Done",
  active: "Active",
  ready: "Ready",
  blocked: "Blocked",
  skipped: "Skipped",
};

/**
 * @param phase the phase to describe
 * @param status the project's stored phase_status map
 * @param present the set of artifact types that currently exist for the project
 */
export function phaseDisplayStatus(
  phase: PhaseDef,
  status: Record<string, StoredState> | undefined,
  present: Set<string>
): PhaseDisplay {
  const stored = status?.[phase.id];

  if (stored === "complete") return { chip: "done" };
  if (stored === "skipped") return { chip: "skipped" };
  if (stored === "active") return { chip: "active" };

  // Not started (available / locked / undefined): ready unless a hard prereq is missing.
  const reqArtifact = HARD_PREREQ[phase.id];
  if (reqArtifact && !present.has(reqArtifact)) {
    const producer = phaseProducing(reqArtifact);
    const blockedReason = producer
      ? `Complete ${producer.name} to run ${phase.name}.`
      : `A prerequisite is missing to run ${phase.name}.`;
    return { chip: "blocked", blockedReason };
  }
  return { chip: "ready" };
}

export interface PipelineSummaryData {
  total: number;
  counts: Record<Chip, number>;
  /** The phase the project is currently sitting on. */
  current?: PhaseDef;
  /** The next phase the owner should act on (first non-done, non-skipped after current). */
  nextActionable?: PhaseDef;
}

/** Roll the per-phase chips up into the numbers the summary card needs. */
export function summarize(
  status: Record<string, StoredState> | undefined,
  present: Set<string>,
  currentPhaseId?: string
): PipelineSummaryData {
  const counts: Record<Chip, number> = { done: 0, active: 0, ready: 0, blocked: 0, skipped: 0 };
  for (const p of PHASES) counts[phaseDisplayStatus(p, status, present).chip]++;

  const current = PHASES.find((p) => p.id === currentPhaseId);
  const nextActionable = PHASES.find((p) => {
    const c = phaseDisplayStatus(p, status, present).chip;
    return c === "active" || c === "ready";
  });

  return { total: PHASES.length, counts, current, nextActionable };
}

export type { PhaseId };
