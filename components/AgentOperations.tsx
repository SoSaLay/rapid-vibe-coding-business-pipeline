"use client";

import { useEffect, useState } from "react";
import type { OpsState } from "@/lib/agent/ops";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";

interface OpsResp {
  ops: OpsState;
  ready: boolean;
  reason?: string;
  stats?: any;
  failures?: any[];
  controls?: { disabled: boolean; disabled_tools: string[] };
  tools?: string[];
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const sec = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Number(x).toFixed(1)}s`);

/** Agent pipeline — stage 7. Monitor, stop, fix, record. Reads the agent's own run log. */
export function AgentOperations({ projectId, live, completed, onUpdated }: { projectId: string; live: boolean; completed: boolean; onUpdated: () => void }) {
  const [d, setD] = useState<OpsResp | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState<Record<number, string>>({});
  const [inc, setInc] = useState({ title: "", severity: "medium", whatHappened: "", approvals: "", correctiveAction: "" });
  const [settings, setSettings] = useState({ owner: "", oncall: "", alertEmail: "", min_success: "", max_p95_s: "", max_cost_per_run: "", max_thumbs_down: "" });
  const [note, setNote] = useState<string | null>(null);

  async function load(n = days) {
    const r = await fetch(`/api/projects/${projectId}/ops?days=${n}`).then((x) => x.json()).catch(() => null);
    if (r) {
      setD(r);
      const o = r.ops ?? {};
      const t = o.thresholds ?? {};
      setSettings({
        owner: o.owner ?? "",
        oncall: o.oncall ?? "",
        alertEmail: o.alert_email ?? "",
        min_success: t.min_success ?? "",
        max_p95_s: t.max_p95_s ?? "",
        max_cost_per_run: t.max_cost_per_run ?? "",
        max_thumbs_down: t.max_thumbs_down ?? "",
      });
    }
  }
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body: any, label: string, msg?: (r: any) => string) {
    setBusy(label);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/projects/${projectId}/ops/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) setError(r.error || "That didn't work.");
    else if (msg) setNote(msg(r));
    await load();
    onUpdated();
    setBusy(null);
  }

  if (!d) return <div className="card p-6 text-sm text-muted">Loading…</div>;
  if (!d.ready) return <div className="card p-6 text-sm text-muted">{d.reason}</div>;

  const s = d.stats ?? {};
  const ctl = d.controls ?? { disabled: false, disabled_tools: [] };
  const open = d.ops.incidents.filter((i) => i.status === "open");

  return (
    <Doc>
      {!live && <div className="card mb-6 p-3 text-sm text-muted">Not live in production yet. These numbers come from staging and local runs.</div>}

      <DocSection title="How it's doing">
        <div className="mb-3 flex gap-2">
          {[1, 7, 30].map((n) => (
            <button key={n} className={`rounded-md border px-3 py-1 text-xs ${days === n ? "border-accent/60 text-fg" : "border-edge text-muted"}`} onClick={() => { setDays(n); load(n); }}>
              {n === 1 ? "24h" : `${n} days`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Runs", String(s.runs ?? 0)],
            ["Finished without hand-off", pct(s.success_rate)],
            ["Task done (scored)", s.scored ? pct(s.judged_completed / s.scored) : "—"],
            ["Policy problems", String(s.policy_violations ?? 0)],
            ["Speed p50 / p95", `${sec(s.latency_p50)} / ${sec(s.latency_p95)}`],
            ["Cost", s.cost !== undefined ? `$${Number(s.cost).toFixed(2)}` : "—"],
            ["Cost per run", s.cost_per_run ? `$${Number(s.cost_per_run).toFixed(4)}` : "—"],
            ["👍 / 👎", `${s.thumbs_up ?? 0} / ${s.thumbs_down ?? 0}`],
            ["Hand-offs", String(s.handoffs ?? 0)],
            ["Runs with a tool error", String(s.tool_error_runs ?? 0)],
            ["Waiting for approval", String(s.awaiting_approval ?? 0)],
            ["Tool calls per run", s.avg_tool_calls !== undefined ? Number(s.avg_tool_calls).toFixed(1) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-edge p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
            </div>
          ))}
        </div>
        {(s.tools ?? []).length > 0 && (
          <>
            <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Tools</div>
            <ul className="mt-2 space-y-1 text-sm">
              {s.tools.map((t: any) => (
                <li key={t.tool} className="flex justify-between gap-3">
                  <code className="text-fg">{t.tool}</code>
                  <span className={t.errors ? "text-warn" : "text-muted"}>{t.calls} calls · {t.errors} errors</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => act({ action: "online-eval", sample: 20 }, "Scoring recent runs…", (r) => `Scored ${r.scored} run(s).`)}>
            Score recent runs (online eval)
          </button>
          <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => act({ action: "alert" }, "Checking alerts…", (r) => (r.result?.alerts?.length ? `${r.result.alerts.length} alert(s)${r.result.emailed ? ", emailed" : ""}.` : "No alerts."))}>
            Check alerts now
          </button>
        </div>
        {d.ops.last_alert && (
          <DocMuted className="mt-2">
            Last check {new Date(d.ops.last_alert.at).toLocaleString()}: {d.ops.last_alert.alerts.length ? d.ops.last_alert.alerts.join(" ") : "all clear"}
          </DocMuted>
        )}
      </DocSection>

      <DocSection title="Kill switch">
        <DocP>Takes effect within about 10 seconds. No redeploy needed.</DocP>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold text-onbright ${ctl.disabled ? "bg-bad" : "bg-ok"}`}>{ctl.disabled ? "Agent is OFF" : "Agent is on"}</span>
          <button className={ctl.disabled ? "btn-primary" : "btn-ghost border-bad/40 text-bad"} disabled={!!busy} onClick={() => act({ action: "kill", disabled: !ctl.disabled }, "Switching…")}>
            {ctl.disabled ? "Turn the agent back on" : "Turn the agent off"}
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {(d.tools ?? []).map((t) => {
            const off = ctl.disabled_tools.includes(t);
            return (
              <li key={t} className="flex items-center justify-between gap-3">
                <code className={off ? "text-bad line-through" : "text-fg"}>{t}</code>
                <button className="text-xs text-accent underline" disabled={!!busy} onClick={() => act({ action: "tool", name: t, on: off }, "Switching…")}>
                  {off ? "Turn on" : "Turn off"}
                </button>
              </li>
            );
          })}
        </ul>
      </DocSection>

      <DocSection title="Failures to fix">
        <DocMuted>
          Failed, handed-off, thumbs-down or low-scored runs (personal data already removed). Write what should have happened and it
          becomes a permanent test case. Then re-run Evaluations and release through Deployment.
        </DocMuted>
        <ul className="mt-3 space-y-3">
          {(d.failures ?? []).map((f: any) => {
            const added = d.ops.cases_added.some((c) => c.run_id === Number(f.id));
            return (
              <li key={f.id} className="rounded-lg border border-edge p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Run {f.id}</span>
                  <span>{new Date(f.at).toLocaleString()}</span>
                  <span>{f.status}</span>
                  {f.feedback === -1 && <span className="text-bad">👎 {f.feedback_note}</span>}
                </div>
                <div className="mt-1 text-fg">{String(f.input ?? "").slice(0, 300)}</div>
                {f.eval_score?.reason && <DocMuted>{f.eval_score.reason}</DocMuted>}
                {f.error && <DocMuted>Error: {f.error}</DocMuted>}
                {added ? (
                  <p className="mt-2 text-xs text-ok">Added to the test cases.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="input h-8 min-w-0 flex-1 text-xs"
                      placeholder="What should it have done?"
                      value={expected[f.id] ?? ""}
                      onChange={(e) => setExpected({ ...expected, [f.id]: e.target.value })}
                    />
                    <button className="btn-ghost text-xs" disabled={!!busy || !expected[f.id]?.trim()} onClick={() => act({ action: "add-case", runId: f.id, expected: expected[f.id] }, "Adding…", (r) => `Added ${r.case} (dataset v${r.dataset_version}). Re-run Evaluations next.`)}>
                      Add to test cases
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {(d.failures ?? []).length === 0 && <DocMuted>Nothing failing.</DocMuted>}
        </ul>
      </DocSection>

      <DocSection title="Incidents">
        {open.length > 0 && <p className="mb-2 text-sm text-bad">{open.length} open</p>}
        <ul className="space-y-2 text-sm">
          {d.ops.incidents.map((i) => (
            <li key={i.id} className="rounded-lg border border-edge p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-onbright ${i.status === "open" ? "bg-bad" : "bg-ok"}`}>{i.status}</span>
                <span className="text-xs text-muted">{i.severity} · {new Date(i.opened_at).toLocaleString()}</span>
                <span className="font-medium text-fg">{i.title}</span>
              </div>
              {i.what_happened && <DocMuted>What happened: {i.what_happened}</DocMuted>}
              {i.approvals && <DocMuted>Approvals: {i.approvals}</DocMuted>}
              {i.corrective_action && <DocMuted>Fix: {i.corrective_action}</DocMuted>}
              {i.status === "open" && (
                <button className="mt-1 text-xs text-accent underline" disabled={!!busy} onClick={() => act({ action: "resolve", id: i.id }, "Resolving…")}>Mark resolved</button>
              )}
            </li>
          ))}
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">Record an incident</summary>
          <div className="mt-2 space-y-2">
            <input className="input h-9 w-full" placeholder="Title" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
            <select className="input h-9" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <textarea className="input w-full" rows={2} placeholder="What happened" value={inc.whatHappened} onChange={(e) => setInc({ ...inc, whatHappened: e.target.value })} />
            <input className="input h-9 w-full" placeholder="Who approved what (e.g. rollback)" value={inc.approvals} onChange={(e) => setInc({ ...inc, approvals: e.target.value })} />
            <textarea className="input w-full" rows={2} placeholder="Corrective action" value={inc.correctiveAction} onChange={(e) => setInc({ ...inc, correctiveAction: e.target.value })} />
            <button className="btn-ghost" disabled={!!busy || !inc.title.trim()} onClick={() => act({ action: "incident", ...inc }, "Saving…").then(() => setInc({ title: "", severity: "medium", whatHappened: "", approvals: "", correctiveAction: "" }))}>
              Save incident
            </button>
          </div>
        </details>
        <DocMuted className="mt-2">The runbook (RUNBOOK.md in the agent&apos;s repo) has the step-by-step: stop it, roll back, fix it, record it.</DocMuted>
      </DocSection>

      <DocSection title="Ownership & alerts">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input h-9" placeholder="Owner" value={settings.owner} onChange={(e) => setSettings({ ...settings, owner: e.target.value })} />
          <input className="input h-9" placeholder="On call (who and how to reach them)" value={settings.oncall} onChange={(e) => setSettings({ ...settings, oncall: e.target.value })} />
          <input className="input h-9 sm:col-span-2" placeholder="Send alerts to (email, via Resend)" value={settings.alertEmail} onChange={(e) => setSettings({ ...settings, alertEmail: e.target.value })} />
          <input className="input h-9" placeholder="Alert below success rate (default 0.85)" value={settings.min_success} onChange={(e) => setSettings({ ...settings, min_success: e.target.value })} />
          <input className="input h-9" placeholder="Alert above p95 seconds (default 60)" value={settings.max_p95_s} onChange={(e) => setSettings({ ...settings, max_p95_s: e.target.value })} />
          <input className="input h-9" placeholder="Alert above cost per run $ (default 1)" value={settings.max_cost_per_run} onChange={(e) => setSettings({ ...settings, max_cost_per_run: e.target.value })} />
          <input className="input h-9" placeholder="Alert at 👎 per day (default 3)" value={settings.max_thumbs_down} onChange={(e) => setSettings({ ...settings, max_thumbs_down: e.target.value })} />
        </div>
        <button
          className="btn-ghost mt-3"
          disabled={!!busy}
          onClick={() =>
            act(
              {
                action: "settings",
                owner: settings.owner,
                oncall: settings.oncall,
                alertEmail: settings.alertEmail,
                thresholds: { min_success: settings.min_success, max_p95_s: settings.max_p95_s, max_cost_per_run: settings.max_cost_per_run, max_thumbs_down: settings.max_thumbs_down },
              },
              "Saving…",
              () => "Saved."
            )
          }
        >
          Save
        </button>
        <DocMuted className="mt-2">
          Alerts also run hourly from GitHub (the agent-ops workflow) once the repo is on GitHub, so they fire even when this app is closed.
        </DocMuted>
      </DocSection>

      <DocSection title="Review">
        <DocFacts items={[{ label: "Test cases added from production", value: String(d.ops.cases_added.length) }, { label: "Open incidents", value: String(open.length) }]} />
        {completed ? (
          <p className="text-sm text-ok">Reviewed. Use ↻ Iterate to start the next cycle.</p>
        ) : (
          <button className="btn-primary mt-2" disabled={!!busy || !live} onClick={() => act({ action: "review" }, "Recording…")}>Record ops review</button>
        )}
      </DocSection>

      {busy && <p className="text-sm text-muted">{busy}</p>}
      {note && <p className="text-sm text-ok">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </Doc>
  );
}
