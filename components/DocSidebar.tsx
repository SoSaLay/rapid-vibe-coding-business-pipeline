"use client";

import Link from "next/link";
import { PHASES } from "@/lib/pipeline";
import { phaseDisplayStatus, type Chip } from "@/lib/pipeline-status";

type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

/** Status-dot color per CI/CD chip (matches the dashboard language). */
const DOT: Record<Chip, string> = {
  done: "bg-ok",
  active: "bg-accent",
  ready: "bg-edge",
  blocked: "bg-warn",
  skipped: "bg-edge/60",
};

/**
 * The pipeline menu: a flat list of phases, one clickable page each. No toggles,
 * no sub-items — a phase's own sections live on the phase page itself (see
 * <PhaseContents>), so this column stays a short, scannable map of the pipeline.
 * Status dots preserve at-a-glance progress.
 */
export function DocSidebar({
  projectId,
  activeSlug,
  status,
  present,
}: {
  projectId: string;
  /** undefined = Onboarding home; otherwise the active phase id. */
  activeSlug?: string;
  status?: Record<string, StoredState>;
  present: Set<string>;
}) {
  const base = `/project/${projectId}`;
  const onboardingActive = !activeSlug;
  // Iteration is an action (loop back to restart a cycle), not a numbered step — pull it
  // out of the numbered list and render it as a refresh action at the bottom.
  const steps = PHASES.filter((p) => p.id !== "iteration");
  const iterationActive = activeSlug === "iteration";

  return (
    <nav aria-label="Pipeline" className="space-y-1 text-sm">
      <Link
        href={base}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors ${
          onboardingActive ? "bg-accent/10 text-fg" : "text-muted hover:bg-edge/50 hover:text-fg"
        }`}
      >
        <span aria-hidden>🚀</span>
        Onboarding
      </Link>

      <div className="my-2 h-px bg-edge" />
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Pipeline</div>

      <ol className="space-y-0.5">
        {steps.map((p, i) => {
          const { chip } = phaseDisplayStatus(p, status, present);
          const isActive = activeSlug === p.id;
          return (
            <li key={p.id}>
              <Link
                href={`${base}/${p.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-w-0 items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors ${
                  isActive ? "bg-accent/10" : "hover:bg-edge/40"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[chip]}`} aria-hidden />
                <span className={`truncate ${isActive ? "font-medium text-fg" : "text-muted"}`}>
                  {i + 1}. {p.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {/* Iteration — an action (loop back), not a numbered step */}
      <div className="mt-3 border-t border-edge pt-3">
        <Link
          href={`${base}/iteration`}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
            iterationActive ? "bg-accent/10 text-fg" : "text-muted hover:bg-edge/40 hover:text-fg"
          }`}
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[12px] ${
              iterationActive ? "border-accent text-accent" : "border-edge text-muted"
            }`}
            aria-hidden
          >
            ↻
          </span>
          <span className={iterationActive ? "font-medium text-fg" : ""}>Iteration</span>
        </Link>
      </div>
    </nav>
  );
}
