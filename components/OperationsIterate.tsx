import { ITERATE_GUIDES } from "@/lib/ops-iterate";

/**
 * The Operations "Iterate" panel — opened from the button under the stage title.
 * Static guidance for now (see lib/ops-iterate.ts).
 */
export function OperationsIterate({ kind }: { kind?: string }) {
  const guide = ITERATE_GUIDES[kind === "agent" ? "agent" : "project"];
  const noun = kind === "agent" ? "agent" : "app";
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5 sm:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold text-fg">Iterate from your customers</h3>
        <p className="mt-0.5 text-xs text-muted">What they say and how they use your {noun}.</p>
        <ul className="mt-3 ml-4 list-disc space-y-1.5 text-sm text-fg/90">
          {guide.iterate.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-fg">Maintenance protocols</h3>
        <p className="mt-0.5 text-xs text-muted">The upkeep that keeps your {noun} healthy.</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          {guide.maintenance.map((m) => (
            <div key={m.what} className="flex gap-3">
              <dt className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-accent2">{m.when}</dt>
              <dd className="text-fg/90">{m.what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
