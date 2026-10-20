"use client";

import { useEffect, useState } from "react";

interface Status {
  total_usd: number;
  development_usd: number;
  testing_usd: number;
  last_test?: { at: string; what: string; usd: number };
  budget_usd: number | null;
  over_budget: boolean;
}

const usd = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);

/**
 * This agent's AI spend this month: the total, development (the pipeline writing, fixing and reviewing its
 * code) and testing (evaluations and live checks), the cost of the last test, and one monthly budget for all of it.
 */
export function SpendMeter({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [s, setS] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    fetch(`/api/spend?project=${projectId}`).then((r) => r.json()).then((d) => !d.error && setS(d)).catch(() => {});
  }, [projectId, refreshKey]);

  async function save() {
    const d = await fetch("/api/spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget: value.trim() === "" ? null : value.replace(/[$,\s]/g, ""), project: projectId }),
    }).then((r) => r.json()).catch(() => null);
    if (d && !d.error) {
      setS(d);
      setEditing(false);
    }
  }

  if (!s) return null;
  const row = "flex items-baseline justify-between gap-4 px-4 py-2.5";
  const budgeted = (spent: number, budget: number | null, over: boolean) =>
    budget !== null && (
      <div className="mx-4 mb-2.5 h-1.5 overflow-hidden rounded-full bg-edge">
        <div
          className={`h-full ${over ? "bg-bad" : spent / budget > 0.8 ? "bg-warn" : "bg-ok"}`}
          style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
        />
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-edge text-sm">
      <div className={`${row} bg-panel`}>
        <span className="font-semibold text-fg">Total spend this month</span>
        <span className="font-semibold text-fg">
          {usd(s.total_usd)}
          {s.budget_usd !== null && <span className="font-normal text-muted"> of {usd(s.budget_usd)} budget</span>}
        </span>
      </div>
      <div className="bg-panel">{budgeted(s.total_usd, s.budget_usd, s.over_budget)}</div>
      <div className="border-t border-edge">
        <div className={row}>
          <span className="text-fg/90">
            Development total <span className="text-xs text-muted">(writing, fixing and reviewing the code)</span>
          </span>
          <span className="text-fg/90">
            {usd(s.development_usd)}
          </span>
        </div>
      </div>
      <div className="border-t border-edge">
        <div className={row}>
          <span className="text-fg/90">
            Testing total <span className="text-xs text-muted">(evaluations and live checks)</span>
          </span>
          <span className="text-fg/90">{usd(s.testing_usd)}</span>
        </div>
      </div>
      <div className={`${row} border-t border-edge`}>
        <span className="text-fg/90">
          Cost of last test {s.last_test && <span className="text-xs text-muted">({s.last_test.what})</span>}
        </span>
        <span className="text-fg/90">{s.last_test ? usd(s.last_test.usd) : "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-4 py-2 text-xs text-muted">
        {editing ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>Monthly budget (development + testing):</span>
            <input
              className="input h-7 w-24 text-xs"
              placeholder="$ per month"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button className="text-accent underline" onClick={save}>Save</button>
            <button className="underline" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <button className="text-accent underline" onClick={() => { setValue(s.budget_usd?.toString() ?? ""); setEditing(true); }}>
            {s.budget_usd !== null ? "Change monthly budget" : "Set a monthly budget"}
          </button>
        )}
        {s.over_budget && <span className="text-bad">Monthly budget reached: automatic checks are paused.</span>}
      </div>
    </div>
  );
}

/**
 * The sidebar's spend box (agents): this month's total, development and testing, the last test's cost,
 * and the monthly budget (development + testing) link. `refreshKey` re-reads it when the page refreshes.
 */
export function SidebarSpend({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [s, setS] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  useEffect(() => {
    fetch(`/api/spend?project=${projectId}`).then((r) => r.json()).then((d) => !d.error && setS(d)).catch(() => {});
  }, [projectId, refreshKey]);
  async function save() {
    const d = await fetch("/api/spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget: value.trim() === "" ? null : value.replace(/[$,\s]/g, ""), project: projectId }),
    }).then((r) => r.json()).catch(() => null);
    if (d && !d.error) {
      setS(d);
      setEditing(false);
    }
  }
  if (!s) return null;
  const line = (label: string, v: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className={strong ? "font-semibold text-fg" : "text-muted"}>{label}</span>
      <span className={strong ? "font-semibold text-fg" : "text-fg/90"}>{v}</span>
    </div>
  );
  return (
    <div className="!mt-4 border-t border-edge px-3 pt-[6.5rem] text-[12px]">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Spend this month</div>
      <div className="space-y-1">
        {line("Total", `${usd(s.total_usd)}${s.budget_usd !== null ? ` / ${usd(s.budget_usd)}` : ""}`, true)}
        {line("Development total", usd(s.development_usd))}
        {line("Testing total", usd(s.testing_usd))}
        {line("Last test", s.last_test ? usd(s.last_test.usd) : "—")}
      </div>
      {s.over_budget && <p className="mt-1.5 text-bad">Monthly budget reached: automatic checks paused.</p>}
      {editing ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            className="input h-7 w-20 text-xs"
            placeholder="$/month"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <button className="text-accent underline" onClick={save}>Save</button>
          <button className="text-muted underline" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <button className="mt-2 text-accent underline" onClick={() => { setValue(s.budget_usd?.toString() ?? ""); setEditing(true); }}>
          {s.budget_usd !== null ? "Change monthly budget" : "Set a monthly budget"}
        </button>
      )}
    </div>
  );
}
