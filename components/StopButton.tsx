"use client";

import { useRef } from "react";

/**
 * Stop-an-in-flight-generation primitive (#9). Each call to `signal()` mints a fresh
 * AbortController; `stop()` aborts the current one. Aborting a fetch rejects with an
 * AbortError — callers swallow it via `isAbort` so a deliberate stop never surfaces as
 * an error and phase state stays intact (we simply don't apply the response).
 */
export function useStopper() {
  const ref = useRef<AbortController | null>(null);
  return {
    signal(): AbortSignal {
      ref.current = new AbortController();
      return ref.current.signal;
    },
    stop() {
      ref.current?.abort();
    },
    isAbort(e: any): boolean {
      return e?.name === "AbortError";
    },
  };
}

/** Small red "Stop" affordance shown alongside an active generation spinner. */
export function StopButton({ onStop, className }: { onStop: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onStop}
      className={`btn-ghost border-bad/40 text-xs text-bad hover:border-bad hover:text-bad ${className || ""}`}
    >
      ■ Stop
    </button>
  );
}
