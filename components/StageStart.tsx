"use client";

import { StopButton } from "./StopButton";

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
}: {
  label: string;
  /** Why it can't start yet (e.g. "Finish Define the Job first"); unset = ready. */
  locked?: string | null;
  busy?: string | null;
  error?: string | null;
  onStart: () => void;
  onStop?: () => void;
}) {
  if (busy) {
    return (
      <div className="flex items-center gap-3 py-8 text-base text-fg">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        {busy}
        {onStop && <StopButton onStop={onStop} />}
      </div>
    );
  }
  return (
    <div className="py-8">
      <button
        disabled={!!locked}
        onClick={onStart}
        className={`w-full rounded-xl px-6 py-4 text-lg font-semibold shadow-lg transition-transform ${
          locked ? "cursor-not-allowed bg-edge text-muted" : "bg-bad text-white hover:scale-[1.01] active:scale-100"
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
