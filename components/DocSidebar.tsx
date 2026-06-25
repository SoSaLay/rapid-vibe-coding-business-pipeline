"use client";

import { useState } from "react";
import Link from "next/link";
import { PHASES, PHASE_SECTIONS, sectionAnchor } from "@/lib/pipeline";
import { phaseDisplayStatus, type Chip } from "@/lib/pipeline-status";

type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

/**
 * Phases whose document has been migrated to the white-paper layout — their
 * sidebar sub-sections are real, clickable anchors. Multi-section reads anchor
 * into <DocSection> headings in the body; single-heading workflow phases (see
 * SINGLE_SECTION_PHASES) anchor to the phase header. Any phase not listed keeps
 * its labels as display-only placeholders until it's converted.
 */
const ANCHORED_PHASES = new Set<string>([
  "business-owner",
  "product-owner",
  "idea-validation",
  "pre-marketing",
  "product-design",
  "engineering",
  "qa",
  "deployment",
  "marketing-sales",
  "operations",
]);

/**
 * Phases that own an artifact screen. The button lives here, among the phase's
 * headings in the expanded toggle — clicking it routes to the phase's /artifacts
 * page, which renders in the right-hand column. The label is per-phase (most are
 * "Generate artifact"; Engineering "executes" its build). Confirmed with the
 * founder: Business Owner, Market Researcher, QA, Deployment, Operations and
 * Iteration are read-only and intentionally have no button.
 */
const ARTIFACT_BUTTONS: Record<string, string> = {
  "product-owner": "Generate artifact",
  "pre-marketing": "Generate artifact",
  "product-design": "Generate artifact",
  engineering: "Execute",
  "marketing-sales": "Generate artifact",
};

/**
 * Which phase toggles are expanded, kept at MODULE scope (keyed by project) so it
 * survives the catch-all page subtree remounting on navigation. Otherwise every
 * phase switch would reset component state and collapse what the founder opened.
 * `undefined` = never touched (auto-open the active phase once); `false` = the
 * founder explicitly collapsed it (respect that — don't re-open).
 */
const OPEN_MEMORY: Record<string, Record<string, boolean>> = {};

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
  artifactMode,
}: {
  projectId: string;
  /** undefined = Onboarding home; otherwise the active phase id. */
  activeSlug?: string;
  status?: Record<string, StoredState>;
  present: Set<string>;
  /** True when the active phase is showing its artifact screen — highlights the
   *  "Generate artifact" entry so the founder sees which face is open. */
  artifactMode?: boolean;
}) {
  // Expanded phases live in module memory (see OPEN_MEMORY) so they persist as the
  // founder moves between phases. `force` just re-renders after we mutate the store.
  const store = (OPEN_MEMORY[projectId] ||= {});
  const [, force] = useState(0);
  // Auto-open the active phase the first time it's seen; respect an explicit collapse.
  if (activeSlug && store[activeSlug] === undefined) store[activeSlug] = true;
  const toggleOpen = (id: string) => {
    store[id] = !store[id];
    force((n) => n + 1);
  };

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
          const isOpen = !!store[p.id];
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
                    onClick={() => toggleOpen(p.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-fg"
                  >
                    <span className={`text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  </button>
                )}
              </div>

              {isOpen && (sections.length > 0 || ARTIFACT_BUTTONS[p.id]) && (
                <div className="mb-1 ml-[1.45rem] mt-0.5 border-l border-edge pl-3">
                  <ul className="space-y-0.5">
                    {sections.map((s) =>
                      ANCHORED_PHASES.has(p.id) ? (
                        <li key={s}>
                          <Link
                            href={`${base}/${p.id}#${sectionAnchor(s)}`}
                            className="block py-1 text-[12px] text-muted/80 transition-colors hover:text-fg"
                          >
                            {s}
                          </Link>
                        </li>
                      ) : (
                        <li key={s} className="cursor-default py-1 text-[12px] text-muted/70" title="Coming soon">
                          {s}
                        </li>
                      )
                    )}
                  </ul>
                  {ARTIFACT_BUTTONS[p.id] && (
                    <Link
                      href={`${base}/${p.id}/artifacts`}
                      className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                        isActive && artifactMode
                          ? "border-accent bg-accent text-white"
                          : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                      }`}
                    >
                      <span aria-hidden>✦</span> {ARTIFACT_BUTTONS[p.id]}
                    </Link>
                  )}
                </div>
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
