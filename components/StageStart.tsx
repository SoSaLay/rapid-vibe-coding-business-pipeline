"use client";

import type { ReactNode } from "react";
import { StageLoading } from "./BuildingRobot";

/**
 * The one control a stage shows before it has run: a big red Start button (locked until the previous
 * stage is done), or — once it's going — a progress line. No explanations; the result appears on its own.
 */
export function StageStart({
  label,
  locked,
  busy,
  error,
  onStart,
  onStop,
  visual,
}: {
  /** Optional loading art shown above the progress line (e.g. the building robot). */
  visual?: ReactNode;
  label: string;
  /** Why it can't start yet (e.g. "Finish Define the Job first"); unset = ready. */
  locked?: string | null;
  busy?: string | null;
  error?: string | null;
  onStart: () => void;
  onStop?: () => void;
}) {
  // Every stage shows the same building robot while it works.
  if (busy) {
    if (visual) {
      return (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          {visual}
          <p className="text-base text-fg">{busy}</p>
        </div>
      );
    }
    return <StageLoading text={busy} onStop={onStop} />;
  }
  return (
    <div className="py-8">
      <button
        disabled={!!locked}
        onClick={onStart}
        className={`w-full rounded-xl px-6 py-4 text-lg font-semibold shadow-lg transition-transform ${
          locked ? "cursor-not-allowed bg-edge text-muted" : "bg-accent text-white hover:scale-[1.01] active:scale-100"
        }`}
      >
        {locked ? "🔒 " : ""}
        {label}
        {locked ? "" : " →"}
      </button>
      {locked && <p className="mt-2 text-center text-sm text-muted">{locked}</p>}
      {error && <p className="mt-3 text-center text-sm text-bad">{error}</p>}
    </div>
  );
}
