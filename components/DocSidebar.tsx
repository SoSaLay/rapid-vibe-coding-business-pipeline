"use client";

import { useState } from "react";
import Link from "next/link";
import { PHASES, PHASE_SECTIONS } from "@/lib/pipeline";
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
 * Documentation-style left navigation. Top "Onboarding" item routes to the project
 * index; each phase is an expandable section that routes to its own page and reveals
 * its (display-only) subheadings. Status dots preserve at-a-glance progress.
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
  // Which phases are expanded — the active one starts open.
  const [open, setOpen] = useState<Record<string, boolean>>(
    activeSlug ? { [activeSlug]: true } : {}
  );

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
          const isOpen = open[p.id] ?? isActive;
          const sections = PHASE_SECTIONS[p.id] ?? [];
          return (
            <li key={p.id}>
              <div
                className={`flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                  isActive ? "bg-accent/10" : "hover:bg-edge/40"
                }`}
              >
                <Link
                  href={`${base}/${p.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[chip]}`} aria-hidden />
                  <span className={`truncate ${isActive ? "font-medium text-fg" : "text-muted"}`}>
                    {i + 1}. {p.name}
                  </span>
                </Link>
                {sections.length > 0 && (
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${p.name}` : `Expand ${p.name}`}
                    aria-expanded={isOpen}
                    onClick={() => setOpen((o) => ({ ...o, [p.id]: !isOpen }))}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-fg"
                  >
                    <span className={`text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  </button>
                )}
              </div>

              {isOpen && sections.length > 0 && (
                <ul className="mb-1 ml-[1.45rem] mt-0.5 space-y-0.5 border-l border-edge pl-3">
                  {sections.map((s) => (
                    <li
                      key={s}
                      className="cursor-default py-1 text-[12px] text-muted/70"
                      title="Coming soon"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
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
