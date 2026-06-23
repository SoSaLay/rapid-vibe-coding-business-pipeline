/**
 * Calm "this stage isn't runnable yet" banner. Shown above a phase body when a hard
 * prerequisite is missing — replaces the old "Locked until the prior phase completes."
 * string. Communicates what to finish first instead of looking locked.
 */
export function GateBanner({ reason }: { reason: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
      <span aria-hidden className="mt-0.5">⏳</span>
      <span>{reason}</span>
    </div>
  );
}
