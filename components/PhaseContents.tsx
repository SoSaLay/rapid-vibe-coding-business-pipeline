"use client";

import Link from "next/link";
import { PHASE_ARTIFACTS } from "@/lib/pipeline";
import type { PhaseId } from "@/lib/pipeline";

/**
 * The artifact page's left-hand nav: the way back to the phase's report, plus the
 * phase's other artifacts. (The report itself has no contents nav — its artifacts
 * are the tiles at the top of the page, see <ArtifactTiles>.)
 */
export function PhaseContents({
  projectId,
  phaseId,
  activeArtifact,
}: {
  projectId: string;
  phaseId: PhaseId;
  /** Selected artifact id. */
  activeArtifact?: string;
}) {
  const base = `/project/${projectId}/${phaseId}`;
  const artifacts = PHASE_ARTIFACTS[phaseId] ?? [];

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
