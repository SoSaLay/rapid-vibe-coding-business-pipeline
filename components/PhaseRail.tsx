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
    <nav aria-label="Pipeline contents">
      <div className="wp-contents mb-3 flex items-center gap-2">
        <span>Contents</span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <ol className="space-y-0.5">
        {PHASES.map((p, i) => {
          const state: PhaseState =
            status?.[p.id] ?? (p.id === activeId ? "active" : i === 0 ? "active" : "locked");
          const active = state === "active";
          const complete = state === "complete";
          const locked = state === "locked";
          const selected = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect?.(p.id)}
                className={`group flex w-full items-center gap-3 rounded-lg py-1.5 pl-2 pr-2 text-left transition-colors
                  ${selected ? "bg-accent/10" : ""}
                  ${onSelect ? "hover:bg-edge/50 cursor-pointer" : "cursor-default"}
                `}
              >
                {/* active/selected accent bar */}
                <span
                  className={`h-7 w-[3px] shrink-0 rounded-full transition-colors ${
                    selected ? "bg-accent" : "bg-transparent"
                  }`}
                />
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    complete
                      ? "bg-ok text-onbright"
                      : selected || active
                      ? "bg-accent text-white"
                      : "bg-edge text-muted"
                  }`}
                >
                  {complete ? "✓" : i + 1}
                </span>
                <span
                  className={`flex-1 truncate text-[13px] ${
                    selected ? "font-medium text-fg" : active ? "text-fg" : locked ? "text-muted/60" : "text-muted"
                  }`}
                >
                  {p.name}
                </span>
                {p.gate === "optional" && (
                  <span className="text-[9px] uppercase tracking-wide text-muted/60">opt</span>
                )}
                {locked && <span className="text-[10px] text-muted/50">🔒</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
