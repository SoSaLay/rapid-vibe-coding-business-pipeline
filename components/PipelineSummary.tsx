"use client";

import { useState } from "react";
import { CHIP_LABEL, summarize, type Chip } from "@/lib/pipeline-status";

type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

const PILL_STYLE: Record<Chip, string> = {
  done: "bg-ok/15 text-ok",
  active: "bg-accent/15 text-accent",
  ready: "bg-edge text-muted",
  blocked: "bg-warn/15 text-warn",
  skipped: "bg-edge/60 text-muted/70",
};

/** Order the count pills meaningfully; hide any that are zero to stay calm. */
const PILL_ORDER: Chip[] = ["done", "active", "ready", "blocked", "skipped"];

/**
 * The "objective summary" — a CI/CD run header. Overall progress, status counts, and a
 * one-line "where you are → what's next", with the longer orientation copy tucked behind a
 * progressive-disclosure "Show more" toggle.
 */
export function PipelineSummary({
  title,
  cycle,
  archived,
  status,
  present,
  currentPhaseId,
  onSelect,
}: {
  title: string;
  cycle?: number;
  archived?: boolean;
  status?: Record<string, StoredState>;
  present: Set<string>;
  currentPhaseId?: string;
  onSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { total, counts, current, nextActionable } = summarize(status, present, currentPhaseId);
  const pct = Math.round((counts.done / total) * 100);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {nextActionable ? (
              <>
                <span>
                  {current ? `At ${current.name}` : "Ready to begin"} · next:{" "}
                  <button
                    onClick={() => onSelect?.(nextActionable.id)}
                    className="font-medium text-accent hover:underline"
                  >
                    {nextActionable.name}
                  </button>
                </span>
              </>
            ) : (
              <span>All stages complete.</span>
            )}
            {(cycle ?? 1) > 1 && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">Cycle {cycle}</span>
            )}
            {archived && <span className="rounded bg-bad/15 px-2 py-0.5 text-xs text-bad">Archived</span>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-fg">
            {counts.done}
            <span className="text-base text-muted">/{total}</span>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted">stages done</div>
        </div>
      </div>

      {/* progress bar */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-edge">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* status count pills */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PILL_ORDER.filter((c) => counts[c] > 0).map((c) => (
          <span
            key={c}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_STYLE[c]}`}
          >
            {counts[c]} {CHIP_LABEL[c]}
          </span>
        ))}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[11px] font-medium text-muted hover:text-fg"
        >
          {expanded ? "Hide context" : "Show more"}
        </button>
      </div>

      {expanded && (
        <p className="mt-3 border-t border-edge pt-3 text-sm leading-relaxed text-muted">
          This is your business pipeline — capture an idea, shape it into a spec, validate it,
          design it, build it, ship it, and grow it. Every stage is clickable: jump anywhere to
          read what it produced. Stages marked <span className="text-warn">Blocked</span> open
          too, but their actions stay disabled until the stage that feeds them is finished. Stages
          you don't need can be skipped. Nothing here is locked away.
        </p>
      )}
    </section>
  );
}
