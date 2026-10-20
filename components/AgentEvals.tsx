"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EvalsState, EvalRun } from "@/lib/agent/evals-state";
import type { EvalSummary, EvalCase } from "@/lib/phases/agent-evals";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";
import { SpendMeter } from "./SpendMeter";

const CATEGORY_LABEL: Record<string, string> = {
  routine: "Routine (your examples)",
  edge: "Edge cases",
  ambiguous: "Ambiguous requests",
  "tool-error": "A tool fails",
  timeout: "A tool times out",
  adversarial: "Attacks (prompt injection)",
  "multi-turn": "Multi-turn conversations",
  memory: "Remembers (and forgets) correctly",
  stopping: "Knows when to stop",
  production: "Real production failures",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const RUN_LABEL = "Running the evaluations (a few minutes)…";

/** Agent pipeline — stage 5. Versioned dataset → repeated runs → metrics vs pinned baseline → release gate. */
export function AgentEvals({
  projectId,
  hasSecurity,
  state,
  completed,
  autostart = false,
  onUpdated,
}: {
  autostart?: boolean;
  projectId: string;
  hasSecurity: boolean;
  state: EvalsState | null;
  completed: boolean;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  /** A run paused by the monthly testing budget, waiting for "Run anyway". */
  const [overBudget, setOverBudget] = useState<{ path: string; body: any; label: string } | null>(null);
  const stopper = useStopper();
  const router = useRouter();
  const autoRan = useRef(false);
  const [loaded, setLoaded] = useState(false);
  // Running the tests is automatic: on arrival, and whenever test cases exist with no results yet.
  useEffect(() => {
    if (!hasSecurity || !loaded || autoRan.current || (state?.runs?.length ?? 0) > 0) return;
    if (!autostart && !cases) return;
    autoRan.current = true;
    (async () => {
      if (!cases && !(await post("dataset", {}, "Writing test cases…"))) return;
      await post("run", {}, RUN_LABEL);
    })();
  }, [autostart, hasSecurity, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/projects/${projectId}/evals/dataset`)
      .then((r) => r.json())
      .then((d) => setCases(d.dataset?.cases ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId, state?.dataset_version]);

  async function post(path: string, body: any, label: string): Promise<boolean> {
    let ok = false;
    setBusy(label);
    setError(null);
    setOverBudget(null);
    setLog(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/evals/${path}`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Request failed.");
        if (d.over_budget) setOverBudget({ path, body, label });
        if (d.output) setLog(d.output);
      } else {
        ok = true;
        onUpdated();
      }
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Request failed.");
    }
    setBusy(null);
    return ok;
  }

  /** New test cases are only useful once they've run: write them, then run them. */
  async function newTests() {
    if (await post("dataset", {}, "Writing test cases…")) await post("run", {}, RUN_LABEL);
  }

  if (!hasSecurity) return <StageStart label="Start Evaluations" locked="Finish Engineering & Development first (including its safety checklist)." onStart={() => {}} />;

  const runs = state?.runs ?? [];
  const last: EvalRun | undefined = runs[runs.length - 1];
  const baseline = state?.baseline ?? null;
  const caseCount = cases?.length ?? 0;

  async function startAll() {
    if (!cases) await post("dataset", {}, "Writing test cases…");
    await post("run", {}, "Running the evaluations (a few minutes)…");
  }
  if (loaded && !cases && runs.length === 0) {
    return <StageStart label="Start Evaluations" busy={busy} error={error} onStart={startAll} onStop={() => { stopper.stop(); setBusy(null); }} />;
  }

  return (
    <Doc>
      {last && (state?.dataset_version ?? 1) === last.summary.dataset_version && (
        <FixAllIssues
          projectId={projectId}
          targets={[
            ...Object.entries(last.summary.categories)
              .filter(([k, r]) => r.rate < 1 && !state?.fixes?.[`cat:${k}`])
              .map(([k]) => ({ kind: "category" as const, category: k })),
            ...last.gate
              .map((g, i) => ({ g, i }))
              .filter(({ g, i }) => !g.ok && i > 0 && !state?.fixes?.[`gate:${i}`])
              .map(({ i }) => ({ kind: "gate" as const, index: i })),
          ]}
          labels={(t) => (t.kind === "category" ? CATEGORY_LABEL[t.category] ?? t.category : `Release rule: ${last.gate[t.index]?.label ?? ""}`)}
          onFixed={onUpdated}
        />
      )}

      <section id="test-cases" className="doc-section scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="doc-h !mb-0">Test cases</h2>
          <div className="flex flex-wrap gap-2">
          {cases && (
            <button
              className={`${Object.keys(state?.fixes ?? {}).length ? "btn-primary" : "btn-ghost"} flex shrink-0 items-center gap-1.5 text-sm`}
              disabled={!!busy}
              onClick={() =>
                Object.keys(state?.fixes ?? {}).length
                  ? post("run", { retest: true }, "Re-testing what was fixed (plus the regression cases)…")
                  : post("run", {}, RUN_LABEL)
              }
              title={
                Object.keys(state?.fixes ?? {}).length
                  ? "Runs only the cases the fixes touched, plus the regression cases; the rest keep their last results"
                  : "Runs this version's test cases once each against your agent as it is now"
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              {Object.keys(state?.fixes ?? {}).length ? "Re-test the fixes" : "Re-run tests"}
            </button>
          )}
          {cases && (
            <button
              className="btn-ghost shrink-0 text-sm"
              disabled={!!busy}
              onClick={() => post("run", { trials: 3 }, "Running every case 3 times to check consistency (a few minutes)…")}
              title="Runs every case 3 times to see whether the agent gets it right every time (3× the credits). Worth it before going live."
            >
              Consistency check (3×)
            </button>
          )}
          <button
            className="btn-ghost flex shrink-0 items-center gap-1.5 text-sm"
            disabled={!!busy}
            onClick={newTests}
            title="Writes a fresh set of test cases, then runs them"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Generate new test cases
          </button>
          </div>
        </div>
        {cases ? (
          <CaseTable
            projectId={projectId}
            runs={runs}
            currentVersion={state?.dataset_version ?? 1}
            currentCounts={state?.dataset_counts ?? {}}
            fixes={state?.fixes ?? {}}
            onFixed={onUpdated}
          />
        ) : (
          <DocMuted>No test cases yet. They start from your example tasks, plus harder cases built from the design and the security threat model.</DocMuted>
        )}
      </section>

      <div className="mb-8">
        <SpendMeter projectId={projectId} refreshKey={`${runs.length}-${busy}`} />
      </div>

      {(busy || error || log) && (
        <section className="doc-section">
          {busy && <StageLoading text={busy} onStop={() => { stopper.stop(); setBusy(null); }} />}
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          {overBudget && (
            <button className="btn-ghost mt-2 text-sm" onClick={() => post(overBudget.path, { ...overBudget.body, force: true }, overBudget.label)}>
              Run anyway
            </button>
          )}
          {log && <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{log}</pre>}
        </section>
      )}

      {last && (
        <>
          <DocSection title="Results">
            <Metrics s={last.summary} base={baseline && state?.baseline_at !== last.at ? baseline : null} />
          </DocSection>

          <DocSection title="Release gate">
            <div className="overflow-hidden rounded-xl border border-edge">
              {last.gate.map((g, i) => (
                <FixRow
                  key={g.label}
                  projectId={projectId}
                  target={{ kind: "gate", index: i }}
                  canFix={!g.ok && i > 0 /* "Unit tests pass" is Engineering's job */}
                  fixed={state?.fixes?.[`gate:${i}`]?.summary}
                  onFixed={onUpdated}
                  cells={
                    <>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${g.ok ? "bg-ok text-onbright" : "bg-bad text-white"}`}>
                        {g.ok ? "✓" : "✗"}
                      </span>
                      <span className="flex-1 text-fg">{g.label}</span>
                    </>
                  }
                />
              ))}
            </div>
            {last.passed && baseline && state?.baseline_at !== last.at && (
              <button className="btn-ghost mt-4 text-sm" disabled={!!busy} onClick={() => post("pin", {}, "Pinning…")}>Make this the new baseline</button>
            )}
          </DocSection>

          {!completed && (
            <div className="mt-12 border-t border-edge pt-8">
              {!last.passed && (
                <input
                  className="input mb-3 h-10 w-full text-sm"
                  placeholder="Blocked. To release anyway, write why (kept in the report)"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                />
              )}
              <button
                className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-100 disabled:opacity-50 disabled:hover:scale-100"
                disabled={!!busy || (!last.passed && !override.trim())}
                onClick={async () => {
                  if (await post("complete", last.passed ? {} : { override }, "Finishing…")) router.push(`/project/${projectId}/deployment?autostart=1`);
                }}
              >
                {busy === "Finishing…" ? "Finishing…" : last.passed ? "Start Deployment →" : "Start Deployment anyway →"}
              </button>
            </div>
          )}
        </>
      )}
    </Doc>
  );
}

function Metrics({ s, base }: { s: EvalSummary; base: EvalSummary | null }) {
  const diff = (now: number, then: number | undefined, higherIsBetter = true) => {
    if (then === undefined) return null;
    const d = Math.round((now - then) * 100);
    if (d === 0) return <span className="text-muted"> (=)</span>;
    const good = higherIsBetter ? d > 0 : d < 0;
    return <span className={good ? "text-ok" : "text-bad"}> ({d > 0 ? "+" : ""}{d})</span>;
  };
  const tiles: { label: string; value: string; delta?: React.ReactNode }[] = [
    { label: "Task success", value: pct(s.overall.rate), delta: diff(s.overall.rate, base?.overall.rate) },
    { label: "Right first try", value: pct(s.first_try.rate), delta: diff(s.first_try.rate, base?.first_try.rate) },
    { label: "Right every try", value: pct(s.consistent.rate), delta: diff(s.consistent.rate, base?.consistent.rate) },
    { label: "Regression suite", value: pct(s.suites.regression.rate), delta: diff(s.suites.regression.rate, base?.suites.regression.rate) },
    { label: "Harder cases", value: pct(s.suites.capability.rate), delta: diff(s.suites.capability.rate, base?.suites.capability.rate) },
    { label: "Grounded answers", value: pct(s.grounded_rate), delta: diff(s.grounded_rate, base?.grounded_rate) },
    { label: "Right tools used", value: pct(s.tool_choice_rate), delta: diff(s.tool_choice_rate, base?.tool_choice_rate) },
    { label: "Injections that worked", value: pct(s.injection_success_rate), delta: diff(s.injection_success_rate, base?.injection_success_rate, false) },
    { label: "Speed p50 / p95", value: `${s.latency_p50?.toFixed(1) ?? "—"}s / ${s.latency_p95?.toFixed(1) ?? "—"}s` },
    { label: "Cost per success", value: s.cost_per_success !== null ? `$${s.cost_per_success.toFixed(4)}` : "—" },
    { label: "Tool calls per run", value: s.avg_tool_calls.toFixed(1) },
    { label: "Runs with a tool error", value: String(s.tool_error_runs) },
  ];
  return (
    <>
      {base && <DocMuted>Numbers in brackets are the change from your baseline, in points.</DocMuted>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-edge p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">{t.label}</div>
            <div className="mt-1 text-lg font-semibold text-fg">{t.value}{t.delta}</div>
          </div>
        ))}
      </div>
    </>
  );
}

type FixTargetUI = { kind: "category"; category: string } | { kind: "gate"; index: number };

/**
 * Big red "Fix all issues": explains every red item at once (kinds of case and release rules),
 * then on Confirm fixes them one after another and the agent is re-checked once.
 */
function FixAllIssues({ projectId, targets, labels, onFixed }: {
  projectId: string;
  targets: FixTargetUI[];
  labels: (t: FixTargetUI) => string;
  onFixed: () => void;
}) {
  const [stage, setStage] = useState<"idle" | "explaining" | "proposed" | "applying">("idle");
  const [items, setItems] = useState<{ explanation: string; plan: string; fixable: boolean }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const call = (step: "explain-all" | "apply-all", list: FixTargetUI[]) =>
    fetch(`/api/projects/${projectId}/evals/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: list, step }),
    }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));

  async function explain() {
    setMsg(null);
    setStage("explaining");
    const d = await call("explain-all", targets);
    if (d.error) {
      setMsg(d.error);
      setStage("idle");
    } else {
      setItems(d.items ?? []);
      setStage("proposed");
    }
  }
  async function apply() {
    const list = targets.filter((_, i) => items[i]?.fixable);
    setStage("applying");
    const d = await call("apply-all", list);
    setStage("idle");
    if (d.error) setMsg(d.error);
    else {
      const failed = (d.results ?? []).filter((r: any) => !r.fixed);
      if (failed.length) setMsg(`${failed.length} couldn't be fixed automatically.`);
      onFixed();
    }
  }

  return (
    <div className="mb-8 space-y-3">
      {stage === "idle" && targets.length === 0 && (
        <button disabled className="w-full cursor-default whitespace-nowrap rounded-xl border border-ok/40 bg-ok/15 px-5 py-3 text-base font-semibold text-ok opacity-80 sm:w-1/4 sm:min-w-[13rem]">
          ✓ All issues fixed
        </button>
      )}
      {stage === "idle" && targets.length > 0 && (
        <button
          className="w-full whitespace-nowrap rounded-xl bg-bad px-5 py-3 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-100 sm:w-1/4 sm:min-w-[13rem]"
          onClick={explain}
        >
          Fix all issues ({targets.length})
        </button>
      )}
      {stage === "explaining" && <StageLoading text="Looking at every issue…" size="sm" />}
      {stage === "proposed" && (
        <div className="space-y-3 rounded-xl border border-bad/40 bg-ink/40 p-4 text-sm">
          {targets.map((t, i) => (
            <div key={i}>
              <div className="font-semibold text-fg">{labels(t)}</div>
              <p className="text-fg/90">{items[i]?.explanation}</p>
              {items[i]?.fixable ? (
                <p className="text-fg"><span className="font-semibold">Fix:</span> {items[i].plan}</p>
              ) : (
                <p className="text-xs text-muted">Can&apos;t be fixed automatically.</p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {items.some((x) => x?.fixable) && (
              <button className="rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white hover:opacity-90" onClick={apply}>
                Confirm, fix all
              </button>
            )}
            <button className="btn-ghost text-sm" onClick={() => setStage("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {stage === "applying" && <StageLoading text={`Fixing ${targets.length} issues in your agent's code, one after another…`} size="sm" />}
      {msg && <p className="text-sm text-warn">{msg}</p>}
    </div>
  );
}

/**
 * A table row with Fix it on the right. Fix it first explains (what's wrong, why, what the AI will
 * change); Confirm makes the change in the agent's code. Afterwards the row says what was done
 * until the tests are re-run.
 */
function FixRow({ projectId, target, canFix, fixed, onFixed, cells }: {
  projectId: string;
  target: FixTargetUI;
  canFix: boolean;
  fixed?: string;
  onFixed: () => void;
  cells: React.ReactNode;
}) {
  const [stage, setStage] = useState<"idle" | "explaining" | "proposed" | "applying">("idle");
  const [p, setP] = useState<{ explanation: string; plan: string; fixable: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const call = (step: "explain" | "apply") =>
    fetch(`/api/projects/${projectId}/evals/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, step }),
    }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));

  async function explain() {
    setMsg(null);
    setStage("explaining");
    const d = await call("explain");
    if (d.error) {
      setMsg(d.error);
      setStage("idle");
    } else {
      setP(d);
      setStage("proposed");
    }
  }
  async function apply() {
    setStage("applying");
    const d = await call("apply");
    setStage("idle");
    setP(null);
    if (d.error) setMsg(d.error);
    else if (!d.fixed) setMsg(d.summary);
    else onFixed();
  }

  return (
    <div className="border-t border-edge bg-ink/40 first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        {cells}
        <span className="w-24 shrink-0 text-right">
          {fixed ? (
            <span className="text-xs font-medium text-warn" title="The code was changed, but it hasn't been tested since">Fixed · untested</span>
          ) : canFix && stage === "idle" ? (
            <button className="rounded-lg bg-bad px-3 py-1 text-xs font-semibold text-white hover:opacity-90" onClick={explain}>
              Fix it
            </button>
          ) : stage === "explaining" ? (
            <span className="text-xs text-muted">Looking…</span>
          ) : null}
        </span>
      </div>
      {fixed && <p className="px-4 pb-2.5 text-xs text-warn">{fixed} Not tested yet: the next release&apos;s live check (or Re-run tests) shows whether it worked, and Fix it comes back if it didn&apos;t.</p>}
      {stage === "proposed" && p && (
        <div className="space-y-2 border-t border-edge px-4 py-3 text-sm">
          <p className="text-fg/90">{p.explanation}</p>
          <p className="text-fg"><span className="font-semibold">Fix:</span> {p.plan}</p>
          <div className="flex gap-2">
            {p.fixable && (
              <button className="rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90" onClick={apply}>
                Confirm, fix it
              </button>
            )}
            <button className="btn-ghost text-sm" onClick={() => setStage("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {stage === "applying" && <StageLoading text="Fixing it in your agent's code…" size="sm" />}
      {msg && <p className="px-4 pb-2.5 text-xs text-warn">{msg}</p>}
    </div>
  );
}

/**
 * Test cases per dataset version: how many of each kind, how the latest run of that version did,
 * and Fix it on kinds with failures. Arrows step through versions; older versions are rebuilt
 * from their runs (and are read-only).
 */
function CaseTable({ projectId, runs, currentVersion, currentCounts, fixes, onFixed }: {
  projectId: string;
  runs: EvalRun[];
  currentVersion: number;
  currentCounts: Record<string, number>;
  fixes: Record<string, { summary: string }>;
  onFixed: () => void;
}) {
  const versions = Array.from(new Set([...runs.map((r) => r.summary.dataset_version), currentVersion])).sort((a, b) => a - b);
  const [v, setV] = useState(currentVersion);
  useEffect(() => setV(currentVersion), [currentVersion]);
  const at = versions.indexOf(v);
  const run = [...runs].reverse().find((r) => r.summary.dataset_version === v);
  const latest = runs[runs.length - 1];
  const counts: Record<string, number> =
    v === currentVersion && Object.keys(currentCounts).length
      ? currentCounts
      : Object.fromEntries(Object.entries(run?.summary.categories ?? {}).map(([k, r]) => [k, Math.round(r.total / Math.max(1, run!.summary.trials))]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const arrow = "flex h-8 w-8 items-center justify-center rounded-md border border-edge text-fg hover:border-accent disabled:opacity-30 disabled:hover:border-edge";
  const when = run ? new Date(run.at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-edge">
      <div className="flex items-center justify-between gap-3 border-b border-edge bg-panel px-3 py-2">
        <button className={arrow} disabled={at <= 0} onClick={() => setV(versions[at - 1])} aria-label="Previous version">‹</button>
        <div className="text-center">
          <div className="text-sm font-semibold text-fg">Version {v}{v === currentVersion ? " (current)" : ""}</div>
          <div className="text-xs text-muted">{total} cases · {when ? `${run?.source === "live" ? `live check of the testing agent (release ${run.release})` : "run"} ${when}` : "not run yet"}</div>
        </div>
        <button className={arrow} disabled={at >= versions.length - 1} onClick={() => setV(versions[at + 1])} aria-label="Next version">›</button>
      </div>
      <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="flex-1">Kind of case</span>
        <span className="w-14 text-right">Cases</span>
        <span className="w-24 whitespace-nowrap text-right">Passed runs</span>
        <span className="w-24" />
      </div>
      {Object.entries(counts).map(([k, n]) => {
        const r = run?.summary.categories[k];
        // Fix it only on the current version's latest run (that's the agent as it is now).
        const fixable = !!r && r.rate < 1 && run === latest && v === currentVersion;
        return (
          <FixRow
            key={k}
            projectId={projectId}
            target={{ kind: "category", category: k }}
            canFix={fixable}
            fixed={fixable ? fixes[`cat:${k}`]?.summary : undefined}
            onFixed={onFixed}
            cells={
              <>
                <span className="flex-1 text-fg">{CATEGORY_LABEL[k] ?? k}</span>
                <span className="w-14 text-right text-fg">{n}</span>
                <span className={`w-24 text-right font-medium ${!r ? "text-muted" : r.rate === 1 ? "text-ok" : r.rate >= 0.5 ? "text-warn" : "text-bad"}`}>
                  {r ? `${r.passed}/${r.total}` : "—"}
                </span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
