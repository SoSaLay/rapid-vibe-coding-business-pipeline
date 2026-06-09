import { PHASES } from "@/lib/pipeline";

type PhaseState = "locked" | "available" | "active" | "complete" | "skipped";

/**
 * The status / gating layer, visualized. Reflects the project's real phase_status
 * when provided: complete phases show a check, the active phase is highlighted,
 * locked phases show a lock, and "optional" phases are marked skippable.
 */
export function PhaseRail({
  activeId,
  status,
}: {
  activeId?: string;
  status?: Record<string, PhaseState>;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-muted mb-3">Pipeline</div>
      <ol className="space-y-1">
        {PHASES.map((p, i) => {
          const state: PhaseState = status?.[p.id] ?? (p.id === activeId ? "active" : i === 0 ? "active" : "locked");
          const active = state === "active";
          const complete = state === "complete";
          const locked = state === "locked";
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                active ? "bg-accent/10 border border-accent/40" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  complete ? "bg-ok text-ink" : active ? "bg-accent text-white" : "bg-edge text-muted"
                }`}
              >
                {complete ? "✓" : i + 1}
              </span>
              <span className={`flex-1 text-sm ${active ? "text-white" : locked ? "text-muted/60" : "text-muted"}`}>
                {p.name}
              </span>
              {p.gate === "optional" && <span className="text-[10px] uppercase tracking-wide text-muted/70">opt</span>}
              {locked && <span className="text-[10px] text-muted/50">🔒</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
