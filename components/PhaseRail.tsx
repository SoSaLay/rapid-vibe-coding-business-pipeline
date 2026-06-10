import { PHASES } from "@/lib/pipeline";

type PhaseState = "locked" | "available" | "active" | "complete" | "skipped";

export function PhaseRail({
  activeId,
  selectedId,
  status,
  onSelect,
}: {
  activeId?: string;
  selectedId?: string;
  status?: Record<string, PhaseState>;
  onSelect?: (id: string) => void;
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
          const selected = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect?.(p.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors
                  ${selected ? "bg-accent/20 border border-accent/60" : active ? "bg-accent/10 border border-accent/40" : ""}
                  ${onSelect ? "hover:bg-edge/40 cursor-pointer" : "cursor-default"}
                `}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    complete ? "bg-ok text-ink" : active || selected ? "bg-accent text-white" : "bg-edge text-muted"
                  }`}
                >
                  {complete ? "✓" : i + 1}
                </span>
                <span className={`flex-1 text-sm ${active || selected ? "text-white" : locked ? "text-muted/60" : "text-muted"}`}>
                  {p.name}
                </span>
                {p.gate === "optional" && <span className="text-[10px] uppercase tracking-wide text-muted/70">opt</span>}
                {locked && <span className="text-[10px] text-muted/50">🔒</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
