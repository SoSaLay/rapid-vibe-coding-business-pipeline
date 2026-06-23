"use client";

import { PHASES } from "@/lib/pipeline";
import { CHIP_LABEL, phaseDisplayStatus, type Chip } from "@/lib/pipeline-status";

type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

/** Chip → token-backed styling. Calm, CI/CD-run feel; no lock icons. */
const CHIP_STYLE: Record<Chip, string> = {
  done: "bg-ok/15 text-ok",
  active: "bg-accent/15 text-accent",
  ready: "bg-edge text-muted",
  blocked: "bg-warn/15 text-warn",
  skipped: "bg-edge/60 text-muted/70",
};

const DISC_STYLE: Record<Chip, string> = {
  done: "bg-ok text-onbright",
  active: "bg-accent text-white",
  ready: "bg-edge text-muted",
  blocked: "bg-warn/20 text-warn",
  skipped: "bg-edge text-muted/60",
};

/**
 * Horizontal CI/CD-style stage strip. Every node is clickable — the whole pipeline is
 * navigable; status is communicated by the chip, not by locking the node.
 */
export function PipelineStrip({
  selectedId,
  status,
  present,
  onSelect,
  interactive = true,
  showChips = true,
}: {
  selectedId?: string;
  status?: Record<string, StoredState>;
  present: Set<string>;
  onSelect?: (id: string) => void;
  interactive?: boolean;
  /** When false, render a neutral stage roadmap (no status chips) — used on the home overview. */
  showChips?: boolean;
}) {
  return (
    <nav aria-label="Pipeline stages" className="-mx-1 overflow-x-auto pb-2">
      <ol className="flex min-w-max items-stretch gap-1 px-1">
        {PHASES.map((p, i) => {
          const { chip } = phaseDisplayStatus(p, status, present);
          const selected = selectedId === p.id;
          const Tag = interactive ? "button" : "div";
          return (
            <li key={p.id} className="flex items-center">
              <Tag
                {...(interactive ? { onClick: () => onSelect?.(p.id), type: "button" as const } : {})}
                aria-current={selected ? "step" : undefined}
                className={`flex w-[150px] flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
                  selected ? "border-accent bg-accent/5" : "border-edge bg-panel"
                } ${interactive ? "hover:border-accent/60 cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      showChips ? DISC_STYLE[chip] : "bg-edge text-muted"
                    }`}
                  >
                    {showChips && chip === "done" ? "✓" : i + 1}
                  </span>
                  {showChips && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${CHIP_STYLE[chip]}`}
                    >
                      {CHIP_LABEL[chip]}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[12px] font-medium leading-snug ${
                    selected ? "text-fg" : "text-muted"
                  }`}
                >
                  {p.name}
                </span>
              </Tag>
              {i < PHASES.length - 1 && (
                <span className="h-px w-3 shrink-0 bg-edge" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
