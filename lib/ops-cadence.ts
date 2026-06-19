/**
 * Pure cadence-timer logic for the Phase 10 recurring ops checklist.
 * Kept dependency-free so both the server routes and the client component
 * can import it (lib/phases/operations.ts pulls in fs via the workspace
 * writer and can't be bundled client-side).
 */

export type Cadence = "daily" | "weekly" | "monthly";

/** Milliseconds before a checked-off item becomes due again. */
export const CADENCE_WINDOW_MS: Record<Cadence, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** A check is due when it was never done or its cadence window has elapsed. */
export function isDue(cadence: Cadence, lastCheckedIso: string | undefined, nowIso: string): boolean {
  if (!lastCheckedIso) return true;
  const elapsed = Date.parse(nowIso) - Date.parse(lastCheckedIso);
  return !(elapsed >= 0) || elapsed >= CADENCE_WINDOW_MS[cadence];
}

/** Human countdown until a done item resets, e.g. "23h" or "6d 4h". Empty when due. */
export function resetsIn(cadence: Cadence, lastCheckedIso: string | undefined, nowIso: string): string {
  if (!lastCheckedIso) return "";
  const remaining = CADENCE_WINDOW_MS[cadence] - (Date.parse(nowIso) - Date.parse(lastCheckedIso));
  if (!(remaining > 0)) return "";
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours <= 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours - days * 24}h`;
}
