"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useRef, useState } from "react";
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
type OpsTab = "info" | "kill" | "failures" | "memory" | "reviews";
const OPS_TABS: [OpsTab, string][] = [
  ["info", "Agent operations"],
  ["kill", "Kill switch"],
  ["failures", "Failures"],
  ["memory", "Manage memory"],
  ["reviews", "Reviews"],
];

export function AgentOperations({ projectId, live, completed, onUpdated }: { projectId: string; live: boolean; completed: boolean; onUpdated: () => void }) {
  const [d, setD] = useState<OpsResp | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState<Record<number, string>>({});
  const [inc, setInc] = useState({ title: "", severity: "medium", whatHappened: "", approvals: "", correctiveAction: "" });
  const [tab, setTab] = useState<OpsTab>("info");
  const [addingIncident, setAddingIncident] = useState(false);
  const [snapDays, setSnapDays] = useState(7);
  /** "Create custom test cases": the owner's brief (null = closed). */
  const [custom, setCustom] = useState<string | null>(null);
  /** Stops "Create new test cases" (nothing is saved once stopped). */
  const writing = useRef<AbortController | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load(n = days) {
    const r = await fetch(`/api/projects/${projectId}/ops?days=${n}`).then((x) => x.json()).catch(() => null);
    if (r) setD(r);
  }
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A new version of the test cases: automatic, or from the owner's brief. */
  async function writeCases(guidance?: string) {
    setBusy("Writing new test cases…");
    setError(null);
    setNote(null);
    writing.current = new AbortController();
    const r = await fetch(`/api/projects/${projectId}/evals/dataset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guidance ? { guidance } : {}),
      signal: writing.current.signal,
    })
      .then((x) => x.json())
      .catch((e) => (e?.name === "AbortError" ? { stopped: true } : null));
    writing.current = null;
    setBusy(null);
    if (r?.stopped) setNote("Stopped. Your test cases weren't changed.");
    else if (r?.dataset) {
      setNote(`Test cases version ${r.dataset.version} is ready (${r.dataset.cases.length} cases); earlier versions are kept. Run them in Evaluations.`);
      setCustom(null);
    } else setError(r?.error || "Couldn't write new test cases.");
  }

  async function act(body: any, label: string, msg?: (r: any) => string) {
    setBusy(label);
    setError(null);
    setNote(null);
    // Stoppable (Stop next to the spinner): nothing is saved once stopped.
    writing.current = new AbortController();
    const res = await fetch(`/api/projects/${projectId}/ops/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: writing.current.signal,
    }).catch((e) => (e?.name === "AbortError" ? null : Promise.reject(e)));
    writing.current = null;
    if (!res) {
      setNote("Stopped. Nothing was saved.");
      setBusy(null);
      return;
    }
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

      <div className="mb-8 overflow-hidden rounded-xl border border-edge">
        <div className="flex divide-x divide-edge overflow-x-auto bg-ink/40 text-xs font-semibold">
          {OPS_TABS.map(([id, label]) => (
            <button
              key={id}
              className={`flex-1 whitespace-nowrap px-3 py-2.5 ${tab === id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              {label}
              {id === "failures" && (d.failures ?? []).length + open.length > 0 && (
                <span className="ml-1.5 rounded-full bg-bad px-1.5 text-[10px] text-white">{(d.failures ?? []).length + open.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "info" && (
        <>
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
          <AgentConsole projectId={projectId} />
        </>
      )}

      {tab === "kill" && (
        <>
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
        </>
      )}

      {tab === "failures" && (
        <>
          <DocSection title="Failures to fix">
            <TestingFailures projectId={projectId} />
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
            </ul>
          </DocSection>
          <DocSection title="Incidents">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <DocMuted className="!mt-0">Something went wrong with the live agent? Add it here, and AI can fix your agent for it.</DocMuted>
              {!addingIncident && (
                <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setAddingIncident(true)}>
                  <span className="text-base leading-none">+</span> Add a new incident
                </button>
              )}
            </div>
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
                  {i.corrective_action && <DocMuted>Your fix idea: {i.corrective_action}</DocMuted>}
                  {i.ai_fix && (
                    <p className={`mt-1 text-xs ${i.ai_fix.fixed ? "text-ok" : "text-warn"}`}>
                      {i.ai_fix.fixed ? "AI fix applied: " : "AI couldn't fix it: "}
                      {i.ai_fix.summary}
                      {i.ai_fix.fixed && " It's being re-tested, then deployed for testing."}
                    </p>
                  )}
                  {i.status === "open" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {!i.ai_fix?.fixed && (
                        <button
                          className="rounded-lg bg-bad px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                          disabled={!!busy}
                          onClick={() => {
                            if (confirm("The AI will change your agent's code to fix this incident, then re-test it and deploy it for testing. Go ahead?"))
                              act({ action: "fix-incident", id: i.id }, "Fixing your agent for this incident…", (r) => (r.fixed ? `Fixed: ${r.summary}` : r.summary));
                          }}
                        >
                          Fix it with AI
                        </button>
                      )}
                      <button className="text-xs text-accent underline" disabled={!!busy} onClick={() => act({ action: "resolve", id: i.id }, "Resolving…")}>Mark resolved</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {addingIncident && (
              <div className="mt-3 space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
                <div className="text-sm font-semibold text-fg">New incident</div>
                <input className="input h-9 w-full" placeholder="What went wrong, in a few words" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
                <select className="input h-9" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <textarea className="input w-full" rows={3} placeholder="What happened (the more detail, the better the AI fix)" value={inc.whatHappened} onChange={(e) => setInc({ ...inc, whatHappened: e.target.value })} />
                <textarea className="input w-full" rows={2} placeholder="Your idea for a fix (optional)" value={inc.correctiveAction} onChange={(e) => setInc({ ...inc, correctiveAction: e.target.value })} />
                <div className="flex gap-2">
                  <button
                    className="btn-primary text-sm"
                    disabled={!!busy || !inc.title.trim()}
                    onClick={() =>
                      act({ action: "incident", ...inc }, "Saving…").then(() => {
                        setInc({ title: "", severity: "medium", whatHappened: "", approvals: "", correctiveAction: "" });
                        setAddingIncident(false);
                      })
                    }
                  >
                    Add incident
                  </button>
                  <button className="btn-ghost text-sm" onClick={() => setAddingIncident(false)}>Cancel</button>
                </div>
              </div>
            )}
          </DocSection>
        </>
      )}

      {tab === "memory" && <UserMemory projectId={projectId} />}

      {tab === "reviews" && (
        <>
          <DocSection title="Take a snapshot">
            <DocMuted className="!mt-0">Save how the agent did over a period: runs, success rate, cost, open incidents and new test cases. Snapshots build a history you can compare.</DocMuted>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[1, 7, 30, 90].map((n) => (
                <button
                  key={n}
                  className={`rounded-md border px-3 py-1 text-xs ${snapDays === n ? "border-accent/60 text-fg" : "border-edge text-muted"}`}
                  onClick={() => setSnapDays(n)}
                >
                  {n === 1 ? "24h" : `${n} days`}
                </button>
              ))}
              <button className="btn-primary ml-1 text-sm" disabled={!!busy || !live} onClick={() => act({ action: "snapshot", days: snapDays }, "Taking a snapshot…", () => "Snapshot saved.")}>
                📸 Take a snapshot
              </button>
            </div>
            {!live && <DocMuted className="mt-2">Available once the agent is live in production.</DocMuted>}
            {(d.ops.snapshots ?? []).length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-edge">
                <table className="w-full text-sm">
                  <thead className="bg-panel text-left text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Taken</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">Runs</th>
                      <th className="px-3 py-2">Success</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Open incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.ops.snapshots ?? []).slice(0, 10).map((sn) => (
                      <tr key={sn.at} className="border-t border-edge">
                        <td className="px-3 py-2 text-fg/90">{new Date(sn.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                        <td className="px-3 py-2 text-fg/90">{sn.days === 1 ? "24h" : `${sn.days} days`}</td>
                        <td className="px-3 py-2 text-fg/90">{sn.runs}</td>
                        <td className="px-3 py-2 text-fg/90">{pct(sn.success_rate)}</td>
                        <td className="px-3 py-2 text-fg/90">{sn.cost === null ? "—" : `$${sn.cost.toFixed(2)}`}</td>
                        <td className="px-3 py-2 text-fg/90">{sn.open_incidents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DocSection>
          <DocSection title="Create new test cases">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-primary text-sm"
                disabled={!!busy}
                onClick={() => writeCases()}
                title="AI re-reads your agent, its open incidents and latest failures, and writes the next version of the test cases"
              >
                ✍️ Create new test cases automatically
              </button>
              <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => setCustom(custom === null ? "" : null)}>
                Create custom test cases
              </button>
              <Link className="ml-1 text-sm text-accent underline" href={`/project/${projectId}/qa#test-cases`}>Open Evaluations →</Link>
            </div>
            {custom !== null && (
              <div className="mt-3 space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
                <textarea
                  className="input w-full text-sm"
                  rows={3}
                  placeholder="What should the new test cases check? e.g. orders with 10+ rows, a store that's out of stock, or the incident from last week"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="btn-primary text-sm" disabled={!!busy || custom.trim().length < 5} onClick={() => writeCases(custom.trim())}>
                    Create these test cases
                  </button>
                  <button className="btn-ghost text-sm" onClick={() => setCustom(null)}>Cancel</button>
                </div>
              </div>
            )}
          </DocSection>
        </>
      )}

      {busy && (
        <StageLoading
          text={busy}
          size="sm"
          onStop={/^(Writing new test cases|Taking a snapshot)/.test(busy) ? () => writing.current?.abort() : undefined}
        />
      )}
      {note && <p className="text-sm text-ok">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </Doc>
  );
}

const KNOWLEDGE_NAME: Record<string, string> = { none: "None", skills: "Built into skills", rag: "Document search" };
const HOST_LABEL: Record<string, string> = { agentcore: "Amazon Bedrock AgentCore", railway: "Railway" };
/** Who uses it, in plain words. */
const LOGIN_LABEL: Record<string, string> = {
  "machine-key": "No one. It does its work and returns the result.",
  "supabase-auth": "People who log in (free to use)",
  "neon-auth": "People who log in (free to use)",
  clerk: "Paying users who log in",
};

/**
 * Agent information: where the agent runs, who uses it, and what it runs today (model, skills, knowledge,
 * tools, live release, last evaluation).
 */
function AgentConsole({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/agent-status`).then((r) => r.json()).then(setSt).catch(() => {});
  }, [projectId]);
  if (!st) return null;
  return (
    <DocSection title="Agent information">
      <DocFacts
        items={[
          { label: "Host", value: HOST_LABEL[st.host] ?? st.host },
          { label: "Who uses it", value: LOGIN_LABEL[st.login] ?? st.login },
          { label: "Model", value: st.model },
          { label: "Skills", value: st.skills.join(", ") || "None" },
          { label: "Knowledge", value: `${KNOWLEDGE_NAME[st.knowledge] ?? st.knowledge}${st.knowledge === "rag" ? ` (${st.knowledge_sources} sources)` : ""}` },
          { label: "Tools", value: st.tools.join(", ") || "None" },
          { label: "Live", value: st.live ? `Release ${st.live.release}` : "Not live yet" },
          { label: "Last evaluation", value: st.evaluated ? `${st.evaluated.passed ? "passed" : "failed"} · ${new Date(st.evaluated.at).toLocaleDateString()} · dataset v${st.evaluated.dataset}` : "Never" },
        ]}
      />
    </DocSection>
  );
}

/**
 * Failures to fix, from testing: what failed in the latest Evaluations run or live check (with a way to
 * fix it), plus the next step when design, build, evaluations and release are out of step.
 */
function TestingFailures({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/agent-status`).then((r) => r.json()).then(setSt).catch(() => {});
  }, [projectId]);
  if (!st) return null;
  const f = st.eval_failures;
  const next = st.next as { step: string; page: string; why: string } | null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">From testing</div>
      {f ? (
        <div className="mt-2 rounded-lg border border-bad/40 bg-bad/5 p-3 text-sm">
          <p className="font-semibold text-fg">
            The latest {f.source === "live" ? `live check${f.release ? ` (release ${f.release})` : ""}` : "evaluation"} didn&apos;t pass:{" "}
            <span className="font-normal text-fg/80">{f.rules.join(" · ")}</span>
          </p>
          <ul className="mt-2 space-y-2">
            {f.cases.map((c: any) => (
              <li key={c.case} className="border-t border-edge pt-2">
                <span className="font-medium text-fg">{c.case}</span>{" "}
                <span className="text-xs text-muted">({c.category} · passed {c.passed_trials}/{c.trials})</span>
                <p className="mt-0.5 text-xs text-fg/80">{String(c.reason).slice(0, 260)}{String(c.reason).length > 260 ? "…" : ""}</p>
              </li>
            ))}
          </ul>
          <Link className="btn-primary mt-3 inline-block text-sm" href={`/project/${projectId}/qa#test-cases`}>Fix it in Evaluations →</Link>
        </div>
      ) : (
        <DocMuted className="mt-1">Nothing failing in testing.</DocMuted>
      )}
      {next && !f && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
          <span className="text-fg"><span className="font-semibold">Next: {next.step}.</span> {next.why}</span>
          <Link className="btn-primary ml-auto text-sm" href={`/project/${projectId}/${next.page}`}>Go →</Link>
        </div>
      )}
    </div>
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
    <DocSection title="Manage memory">
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
