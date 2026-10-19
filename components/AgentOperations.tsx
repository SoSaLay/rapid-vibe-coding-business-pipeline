"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useState } from "react";
import type { OpsState } from "@/lib/agent/ops";
import Link from "next/link";
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
  const [settings, setSettings] = useState({ owner: "", oncall: "", min_success: "", max_p95_s: "", max_cost_per_run: "", max_thumbs_down: "" });
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

      <AgentConsole projectId={projectId} />

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
          <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => act({ action: "alert" }, "Checking alerts…", (r) => (r.result?.alerts?.length ? `${r.result.alerts.length} alert(s).` : "No alerts."))}>
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

      <UserMemory projectId={projectId} />

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
          Once the repo is on GitHub, the agent-ops workflow checks these every hour. When a threshold is crossed the run fails, and GitHub
          emails you about failed runs. No extra service, and it works even when this app is closed.
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

      {busy && <StageLoading text={busy} size="sm" />}
      {note && <p className="text-sm text-ok">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </Doc>
  );
}

const KNOWLEDGE_NAME: Record<string, string> = { none: "None", skills: "Built into skills", rag: "Document search" };

/**
 * Agent console: what the agent runs today and how to change it. Light changes (skills, knowledge, model,
 * limits) go Design → Apply → Evaluations → Release; new tools take the full Build path.
 */
function AgentConsole({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/agent-status`).then((r) => r.json()).then(setSt).catch(() => {});
  }, [projectId]);
  if (!st) return null;
  const base = `/project/${projectId}`;
  return (
    <DocSection title="Your agent">
      <DocFacts
        items={[
          { label: "Model", value: st.model },
          { label: "Skills", value: st.skills.join(", ") || "None" },
          { label: "Knowledge", value: `${KNOWLEDGE_NAME[st.knowledge] ?? st.knowledge}${st.knowledge === "rag" ? ` (${st.knowledge_sources} sources)` : ""}` },
          { label: "Tools", value: st.tools.join(", ") || "None" },
          { label: "Live", value: st.live ? `Release ${st.live.release}` : "Not live yet" },
          { label: "Last evaluation", value: st.evaluated ? `${st.evaluated.passed ? "passed" : "failed"} · ${new Date(st.evaluated.at).toLocaleDateString()} · dataset v${st.evaluated.dataset}` : "Never" },
        ]}
      />
      {st.next ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
          <span className="text-fg">
            <span className="font-semibold">Next: {st.next.step}.</span> {st.next.why}
          </span>
          <Link className="btn-primary ml-auto text-sm" href={`${base}/${st.next.page}`}>Go →</Link>
        </div>
      ) : (
        <DocMuted className="mt-3">Everything is in step: what's live is what you designed and evaluated.</DocMuted>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link className="btn-ghost" href={`${base}/agent-design`}>Add a skill</Link>
        <Link className="btn-ghost" href={`${base}/agent-design`}>Change the model</Link>
        <Link className="btn-ghost" href={`${base}/agent-design`}>Change knowledge</Link>
        <Link className="btn-ghost" href={`${base}/agent-design`}>Add or change a tool</Link>
      </div>
      <DocMuted className="mt-2">
        Skills, knowledge, model and limits are light changes: approve → apply (no code rewrite) → Evaluations → release. A new or
        changed tool rewrites code, so it goes through the full build. Either way, the evaluation gate decides what reaches production.
      </DocMuted>
    </DocSection>
  );
}

/** See what the agent remembers about a user, and erase it on request (right to be forgotten). */
function UserMemory({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<{ user: string; facts: number; conversations: number; last: string | null }[] | null>(null);
  const [forgotten, setForgotten] = useState<{ user: string; at: string; removed: Record<string, number> }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<{ id: number; kind: string; category: string; text: string; at: string }[]>([]);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(body: any) {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/ops/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(r.error || "That didn't work.");
    return res.ok ? r : null;
  }
  async function find() {
    const r = await call({ action: "memory-users", search });
    if (r) {
      setUsers(r.users);
      setForgotten(r.forgotten ?? []);
    }
  }
  async function show(user: string) {
    if (open === user) return setOpen(null);
    const r = await call({ action: "memory-show", user });
    if (r) {
      setItems(r.items);
      setOpen(user);
      setConfirm("");
    }
  }
  async function forget(user: string) {
    const r = await call({ action: "memory-forget", user, confirm });
    if (r) {
      const n = r.removed ?? {};
      setMsg(`Forgot ${user}: ${n.memory ?? 0} memories, ${n.conversation_checkpoints ?? 0} saved conversation steps, ${n.runs ?? 0} run-log entries.`);
      setOpen(null);
      await find();
    }
  }
  useEffect(() => { find(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DocSection title="User memory">
      <DocMuted>What the agent remembers about each person. If someone asks to be forgotten, erase it here. That removes their memories, saved conversations and run-log entries for this agent.</DocMuted>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input h-9 min-w-0 flex-1" placeholder="Find a user id" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
        <button className="btn-ghost" disabled={busy} onClick={find}>Search</button>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {(users ?? []).map((u) => (
          <li key={u.user} className="rounded-lg border border-edge p-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-fg">{u.user}</code>
              <span className="text-xs text-muted">{u.facts} facts · {u.conversations} conversations · last {u.last ? new Date(u.last).toLocaleDateString() : "—"}</span>
              <button className="ml-auto text-xs text-accent underline" onClick={() => show(u.user)}>{open === u.user ? "Close" : "View"}</button>
            </div>
            {open === u.user && (
              <div className="mt-2 space-y-2">
                <ul className="max-h-60 space-y-1 overflow-auto text-xs">
                  {items.map((i) => (
                    <li key={i.id}>
                      <span className="text-muted">{new Date(i.at).toLocaleDateString()} · {i.kind === "profile" ? `fact (${i.category})` : "conversation"}:</span>{" "}
                      <span className="text-fg/90">{i.text}</span>
                    </li>
                  ))}
                  {items.length === 0 && <li className="text-muted">Nothing stored.</li>}
                </ul>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-bad/30 bg-bad/5 p-2">
                  <input className="input h-8 min-w-0 flex-1 text-xs" placeholder={`Type ${u.user} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  <button className="btn-ghost border-bad/40 text-xs text-bad" disabled={busy || confirm !== u.user} onClick={() => forget(u.user)}>Forget this user</button>
                </div>
                <p className="text-[11px] text-muted">This can't be undone. Traces already sent to Langfuse are deleted separately in Langfuse.</p>
              </div>
            )}
          </li>
        ))}
        {users && users.length === 0 && <DocMuted>No one is remembered yet.</DocMuted>}
      </ul>
      {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
      {forgotten.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">Deletion log ({forgotten.length})</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {forgotten.map((f) => (
              <li key={f.user + f.at}>{new Date(f.at).toLocaleString()} · {f.user} · removed {Object.entries(f.removed).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")}</li>
            ))}
          </ul>
        </details>
      )}
    </DocSection>
  );
}
