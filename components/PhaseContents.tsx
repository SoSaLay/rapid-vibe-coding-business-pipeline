"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PHASE_ARTIFACTS, PHASE_SECTIONS, PHASES_WITH_ARTIFACTS, sectionAnchor } from "@/lib/pipeline";
import type { PhaseId } from "@/lib/pipeline";

/**
 * The phase page's own left-hand contents nav.
 *
 * The pipeline menu (see <DocSidebar>) is a flat list of phases; a phase's
 * sections live HERE, on the page the founder opened. Two faces, same column:
 *
 *  - doc face       — the phase's sections as scroll-spy anchors, ending in the
 *                     "View artifacts" button for phases that own artifacts.
 *  - artifact face  — the phase's artifact menu, with a way back to the report.
 */
export function PhaseContents({
  projectId,
  phaseId,
  artifactMode,
  activeArtifact,
}: {
  projectId: string;
  phaseId: PhaseId;
  artifactMode?: boolean;
  /** Selected artifact id on the artifact face. */
  activeArtifact?: string;
}) {
  const base = `/project/${projectId}/${phaseId}`;
  const sections = PHASE_SECTIONS[phaseId] ?? [];
  const artifacts = PHASE_ARTIFACTS[phaseId] ?? [];
  const active = useScrollSpy(artifactMode ? [] : sections.map(sectionAnchor));

  if (artifactMode) {
    return (
      <nav aria-label="Artifacts" className={SHELL_CLS}>
        <Link href={base} className="mb-1 inline-block text-[12px] text-muted transition-colors hover:text-fg lg:mb-3">
          ← Back to report
        </Link>
        {artifacts.length > 0 && <div className="wp-contents mb-2 hidden lg:block">Artifacts</div>}
        {artifacts.length > 0 && (
          <ul className={LIST_CLS}>
            {artifacts.map((it) => (
              <li key={it.id}>
                <Link
                  href={`${base}/artifacts/${it.id}`}
                  aria-current={activeArtifact === it.id ? "true" : undefined}
                  className={itemCls(activeArtifact === it.id)}
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="On this page" className={SHELL_CLS}>
      <div className="wp-contents mb-2 hidden lg:block">On this page</div>
      {/* One compact row on a phone (chips scroll, button parked at the end);
          the button drops below the list once there's a column to put it in. */}
      <div className="flex items-center gap-2 lg:block">
        <ul className={LIST_CLS}>
          {sections.map((s) => {
            const id = sectionAnchor(s);
            return (
              <li key={s}>
                <a href={`#${id}`} aria-current={active === id ? "true" : undefined} className={itemCls(active === id)}>
                  {s}
                </a>
              </li>
            );
          })}
        </ul>

        {PHASES_WITH_ARTIFACTS.has(phaseId) && (
          <Link
            href={`${base}/artifacts`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent/20 lg:mt-3"
          >
            <span aria-hidden>✦</span> View artifacts
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * One nav item, two shapes. On a phone the contents nav is a horizontal strip of
 * chips under the title (a tall vertical list would push the actual document off
 * the first screen); from lg up it becomes the usual vertical rail with an active
 * left border.
 */
const LIST_CLS =
  "no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto lg:block lg:space-y-0.5 lg:overflow-visible lg:border-l lg:border-edge";

/**
 * The nav shell. Stickiness lives on the wrapping <aside> (see the workspace page)
 * — this element only has to look right once pinned: on a phone it's an opaque bar
 * over the scrolling document, so it needs the page fill and a bottom rule; from lg
 * up it's a plain column with the page behind it either way.
 */
const SHELL_CLS = "page-bg border-b border-edge py-2 lg:border-b-0 lg:py-0";

function itemCls(active: boolean): string {
  return [
    "block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors",
    "lg:-ml-px lg:whitespace-normal lg:rounded-none lg:border-l lg:px-0 lg:pl-3",
    active
      ? "bg-accent/10 font-medium text-fg lg:bg-transparent lg:border-l-accent"
      : "text-muted hover:text-fg lg:border-l-transparent lg:hover:border-l-edge",
  ].join(" ");
}

/**
 * Highlights whichever section the founder is currently reading.
 *
 * Deliberately a scroll-position calculation rather than an IntersectionObserver:
 * it re-reads the headings on every frame it runs, so it needs no re-attaching
 * when a phase swaps its whole document in without navigating (generate the spec
 * and the dialogue UI is replaced by <DocSection>s), and it keeps working in
 * contexts where observers are throttled.
 *
 * The reading line sits just below the sticky header area — the active section is
 * the last one whose top has passed it.
 */
const READING_LINE = 120;

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  const key = ids.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;

    // Measured straight from the scroll handler rather than inside a rAF: browsers
    // already fire passive scroll at most once a frame, a handful of rect reads is
    // cheap, and rAF is suspended whenever the page isn't being painted — which
    // would leave the highlight stale on the first scroll after returning to a tab.
    const measure = () => {
      let current: string | undefined;
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= READING_LINE) current = id;
        else if (current) break;
      }
      // Above the first heading, the first section is still what you're reading.
      setActive(current ?? list.find((id) => document.getElementById(id)));
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [key]);

  return active;
}
