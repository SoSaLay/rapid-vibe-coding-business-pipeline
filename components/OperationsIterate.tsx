"use client";

import { useEffect, useState } from "react";
import { ITERATE_GUIDES } from "@/lib/ops-iterate";

/** Agents: next steps generated from the live run log, incidents and eval state (replaces the static list). */
function useAgentIterate(projectId?: string, enabled?: boolean): string[] | null {
  const [items, setItems] = useState<string[] | null>(null);
  useEffect(() => {
    if (!enabled || !projectId) return;
    fetch(`/api/projects/${projectId}/ops?days=7`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ready) return setItems([d?.reason || "Set up the state database in Deployment to see live signals."]);
        const s = d.stats ?? {};
        const out: string[] = [];
        const open = (d.ops?.incidents ?? []).filter((i: any) => i.status === "open");
        if (open.length) out.push(`Resolve ${open.length} open incident(s): ${open.map((i: any) => i.title).join("; ")}`);
        const added = new Set((d.ops?.cases_added ?? []).map((c: any) => c.run_id));
        const unconverted = (d.failures ?? []).filter((f: any) => !added.has(Number(f.id))).length;
        if (unconverted) out.push(`Turn ${unconverted} failed run(s) into test cases (Failures to fix)`);
        if ((d.ops?.cases_added ?? []).length) out.push("Re-run Evaluations so the new production cases gate the next release");
        for (const t of s.tools ?? []) if (t.calls >= 3 && t.errors / t.calls > 0.2) out.push(`${t.tool} fails in ${Math.round((t.errors / t.calls) * 100)}% of calls: check its credential or API`);
        if (s.thumbs_down) out.push(`Read the ${s.thumbs_down} thumbs-down note(s) and add the worst as test cases`);
        if (s.runs && s.scored < Math.min(20, s.runs)) out.push("Score recent runs (online eval) to measure real task success");
        if (s.policy_violations) out.push(`${s.policy_violations} run(s) broke policy: tighten approvals or turn the tool off`);
        if (s.latency_p95 && s.latency_p95 > 30) out.push(`p95 is ${Number(s.latency_p95).toFixed(0)}s: consider a faster model or fewer steps in Agent Design`);
        if (!out.length) out.push("Nothing urgent. Keep scoring runs and collecting feedback.");
        setItems(out);
      })
      .catch(() => setItems(null));
  }, [projectId, enabled]);
  return items;
}

/**
 * The Operations "Iterate" panel — opened from the button under the stage title.
 * Static guidance for now (see lib/ops-iterate.ts).
 */
export function OperationsIterate({ kind, projectId }: { kind?: string; projectId?: string }) {
  const guide = ITERATE_GUIDES[kind === "agent" ? "agent" : "project"];
  const live = useAgentIterate(projectId, kind === "agent");
  const noun = kind === "agent" ? "agent" : "app";
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5 sm:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold text-fg">{live ? "What to do next" : "Iterate from your customers"}</h3>
        <p className="mt-0.5 text-xs text-muted">{live ? "From your agent's runs, failures and incidents this week." : `What they say and how they use your ${noun}.`}</p>
        <ul className="mt-3 ml-4 list-disc space-y-1.5 text-sm text-fg/90">
          {(live ?? guide.iterate).map((x) => (
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
