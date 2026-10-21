"use client";

import { StageLoading } from "./BuildingRobot";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, type PlatformId } from "@/lib/agent/platforms";
import type { EvalsState, EvalRun } from "@/lib/agent/evals-state";
import type { EvalSummary, EvalCase } from "@/lib/phases/agent-evals";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";

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

/** Which build Fix it works on (the tab picked at the top of Evaluations). */
const PlatformContext = createContext<PlatformId>("self");

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
  /** A run paused by the monthly budget, waiting for "Run anyway". */
  const [overBudget, setOverBudget] = useState<{ path: string; body: any; label: string } | null>(null);
  const stopper = useStopper();
  const router = useRouter();
  const autoRan = useRef(false);
  const [loaded, setLoaded] = useState(false);
  /** Re-run tests: the 1× / 3× choice is open. */
  const [rerun, setRerun] = useState(false);
  /** The tracing tool where evaluation runs can be seen (Langfuse by default). */
  const [viewer, setViewer] = useState<{ label?: string; url?: string } | null>(null);
  /** Which build is being tested: our way, or the agent's build on Claude / ChatGPT. */
  const [platform, setPlatform] = useState<PlatformId>(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("platform") : null;
    return q === "claude" || q === "chatgpt" ? q : "self";
  });
  /** The platforms this agent is built on (our way when it has a local build). */
  const [builtOn, setBuiltOn] = useState<PlatformId[] | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/hosted`)
      .then((r) => r.json())
      .then((d) => {
        // Only the path picked in Development.
        const chosen = (d?.chosen ?? "self") as PlatformId;
        setBuiltOn([chosen]);
        setPlatform(chosen);
      })
      .catch(() => setBuiltOn(["self"]));
  }, [projectId]);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/evals/viewer`).then((r) => r.json()).then(setViewer).catch(() => {});
  }, [projectId]);
  // Running the tests is automatic: on arrival, and whenever test cases exist with no results yet.
  useEffect(() => {
    if (!hasSecurity || !loaded || !builtOn || autoRan.current || (state?.runs ?? []).some((r) => (r.platform ?? "self") === platform)) return;
    if (!autostart && !cases) return;
    autoRan.current = true;
    (async () => {
      if (!cases && !(await post("dataset", {}, "Writing test cases…"))) return;
      await post("run", {}, RUN_LABEL);
    })();
  }, [autostart, hasSecurity, loaded, builtOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
        body: JSON.stringify(path === "run" && platform !== "self" ? { ...(body ?? {}), platform } : body ?? {}),
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

  if (!hasSecurity) return <StageStart label="Start Evaluations" locked="Finish Development first (including its safety checklist)." onStart={() => {}} />;

  // Runs of the build being looked at (live checks belong to our way's deployment).
  const runs = (state?.runs ?? []).filter((r) => (r.platform ?? "self") === platform);
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
    <PlatformContext.Provider value={platform}>
    <Doc>
      {builtOn && builtOn.length > 1 && (
        <div className="mb-8 overflow-hidden rounded-xl border border-edge">
          <div className="flex divide-x divide-edge bg-ink/40 text-sm">
            {PLATFORMS.filter((p) => builtOn.includes(p.id)).map((p) => (
              <button
                key={p.id}
                className={`flex-1 px-3 py-2.5 font-semibold ${platform === p.id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
                onClick={() => setPlatform(p.id)}
                aria-pressed={platform === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {platform !== "self" && (
        <p className="mb-6 rounded-lg border border-edge bg-ink/40 px-4 py-3 text-sm text-fg/90">
          These runs talk to the agent hosted on {platform === "claude" ? "Claude" : "ChatGPT"}, with each test case&apos;s test data in its
          sandbox (nothing real is sent or bought). Fix it updates the {platform === "claude" ? "Claude" : "ChatGPT"} agent itself and re-checks the
          fix there.
        </p>
      )}
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
              onClick={() => setRerun((v) => !v)}
              aria-expanded={rerun}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Re-run tests
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
          {viewer?.url && (
            <a className="btn-ghost flex shrink-0 items-center gap-1.5 text-sm" href={viewer.url} target="_blank" rel="noreferrer" title={`See every evaluation run, step by step, in ${viewer.label}`}>
              View in {viewer.label} ↗
            </a>
          )}
          </div>
        </div>
        {rerun && cases && (
          <div className="mb-4 grid gap-2 rounded-xl border border-edge bg-ink/40 p-3 text-sm sm:grid-cols-3">
            <button
              className="rounded-lg bg-accent p-3 text-left text-white shadow-md transition-transform hover:scale-[1.02] hover:opacity-95 active:scale-100"
              onClick={() => {
                setRerun(false);
                Object.keys(state?.fixes ?? {}).length
                  ? post("run", { retest: true }, "Re-testing what was fixed (plus the regression cases)…")
                  : post("run", {}, RUN_LABEL);
              }}
            >
              <div className="font-semibold">Run once (1×)</div>
              <div className="mt-0.5 text-xs text-white/80">Quick and cheaper. Shows if it works.</div>
            </button>
            <button
              className="rounded-lg bg-accent p-3 text-left text-white shadow-md transition-transform hover:scale-[1.02] hover:opacity-95 active:scale-100"
              onClick={() => {
                setRerun(false);
                post("run", { trials: 3 }, "Running every case 3 times (a few minutes)…");
              }}
            >
              <div className="font-semibold">Run 3 times (3×)</div>
              <div className="mt-0.5 text-xs text-white/80">Costs 3× more. Shows if it works every time. Good before going live.</div>
            </button>
            <button
              className="rounded-lg border border-edge bg-panel p-3 text-left text-fg transition-transform hover:scale-[1.02] active:scale-100"
              onClick={() => {
                setRerun(false);
                post("run", { practice: true }, "Practice run on a cheaper model…");
              }}
            >
              <div className="font-semibold">Practice run</div>
              <div className="mt-0.5 text-xs text-muted">Much cheaper: runs on a smaller model. A rough check while you iterate; it doesn&apos;t count for release.</div>
            </button>
          </div>
        )}
        {cases ? (
          <CaseTable
            projectId={projectId}
            runs={runs}
            currentVersion={state?.dataset_version ?? 1}
            currentCounts={state?.dataset_counts ?? {}}
            fixes={state?.fixes ?? {}}
            onFixed={onUpdated}
          />
        ) : null}
        {cases && cases.length > 0 && (
          <ManageCases projectId={projectId} cases={cases} overrides={state?.case_overrides ?? {}} busy={!!busy} onChanged={onUpdated} />
        )}
        {cases ? null : (
          <DocMuted>No test cases yet. They start from your example tasks, plus harder cases built from the design and the security threat model.</DocMuted>
        )}
      </section>

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
                  fixed={state?.fixes?.[`gate:${i}`]}
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
    </PlatformContext.Provider>
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
  const fixPlatform = useContext(PlatformContext);
  const call = (step: "explain-all" | "apply-all", list: FixTargetUI[]) =>
    fetch(`/api/projects/${projectId}/evals/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: list, step, ...(fixPlatform !== "self" ? { platform: fixPlatform } : {}) }),
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
      const failed = (d.results ?? []).filter((r: any) => !r.fixed || (!r.verified && !r.release));
      const ok = (d.results ?? []).length - failed.length;
      setMsg(`${ok} fixed and checked${failed.length ? `; ${failed.length} still failing after up to 3 tries (see below).` : "."}`);
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
                <p className="text-xs text-muted">
                  Can&apos;t be fixed automatically.{" "}
                  <AskBuilder projectId={projectId} text={`${labels(t)}: ${items[i]?.explanation ?? ""}`} />
                </p>
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
  fixed?: FixInfo;
  onFixed: () => void;
  cells: React.ReactNode;
}) {
  const [stage, setStage] = useState<"idle" | "explaining" | "proposed" | "applying">("idle");
  const [p, setP] = useState<{ explanation: string; plan: string; fixable: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fixPlatform = useContext(PlatformContext);
  const call = (step: "explain" | "apply") =>
    fetch(`/api/projects/${projectId}/evals/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, step, ...(fixPlatform !== "self" ? { platform: fixPlatform } : {}) }),
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
    else if (!d.verified && !d.release) {
      setMsg(d.summary);
      onFixed();
    }
    else onFixed();
  }

  return (
    <div className="border-t border-edge bg-ink/40 first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        {cells}
        <span className="w-24 shrink-0 text-right">
          {fixed?.verified ? (
            <span className="text-xs font-medium text-ok" title="The failing cases were run again after the fix and now pass">
              ✓ Fixed{fixed.tries && fixed.tries > 1 ? ` (try ${fixed.tries})` : ""}
            </span>
          ) : fixed ? (
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
      {fixed?.verified && (
        <p className="px-4 pb-2.5 text-xs text-ok">{fixed.summary} The cases that failed now pass; it&apos;s being re-tested and released.</p>
      )}
      {fixed && !fixed.verified && (
        <p className="px-4 pb-2.5 text-xs text-warn">
          {fixed.summary} Not confirmed yet: <AskBuilder projectId={projectId} text={fixed.summary} />
        </p>
      )}
      {stage === "proposed" && p && (
        <div className="space-y-2 border-t border-edge px-4 py-3 text-sm">
          <p className="text-fg/90">{p.explanation}</p>
          <p className="text-fg"><span className="font-semibold">Fix:</span> {p.plan}</p>
          <div className="flex gap-2">
            {p.fixable ? (
              <button className="rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90" onClick={apply}>
                Confirm, fix it
              </button>
            ) : (
              <AskBuilder projectId={projectId} text={`${p.explanation} ${p.plan}`} button />
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
  fixes: Record<string, FixInfo>;
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
          <div className="text-xs text-muted">{total} cases · {when ? `${run?.source === "live" ? `live check of the testing agent (release ${run.release})` : run?.practice ? `practice run on ${run.practice.split(":")[1] ?? run.practice}` : run?.platform ? `run on ${run.platform === "claude" ? "Claude" : "ChatGPT"}` : "run"} ${when}${run?.summary.runs_reused ? ` · ${run.summary.runs_reused} reused (already passed on this code, free)` : ""}` : "not run yet"}</div>
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
            fixed={fixable ? fixes[`cat:${k}`] : undefined}
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

/**
 * When Fix it can't help: hand the problem to the Automatic Agent Changer (Agent Design's side panel), which
 * can change the built agent's tools and instructions in conversation. The problem is prefilled for the owner.
 */
export function AskBuilder({ projectId, text, button = false }: { projectId: string; text: string; button?: boolean }) {
  const href = `/project/${projectId}/agent-design?ask=${encodeURIComponent(`Please fix this in my agent: ${text}`.slice(0, 1500))}`;
  return (
    <a className={button ? "btn-ghost text-sm" : "text-accent underline"} href={href}>
      Ask the Agent Changer →
    </a>
  );
}

/**
 * Manage test cases: see every case and remove the ones that no longer make sense. Removing asks first
 * (fewer tests can let mistakes through) and writes a new version; earlier versions are kept.
 */
function ManageCases({ projectId, cases, overrides, busy, onChanged }: {
  projectId: string;
  cases: EvalCase[];
  overrides: Record<string, { why?: string }>;
  busy: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const attacks = cases.filter((c) => picked.has(c.id) && c.category === "adversarial").length;

  async function remove() {
    setWorking(true);
    setMsg(null);
    const d = await fetch(`/api/projects/${projectId}/evals/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", ids: [...picked] }),
    }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));
    setWorking(false);
    setConfirming(false);
    if (d.error) return setMsg(d.error);
    setPicked(new Set());
    setMsg(`Removed ${d.removed}. Test cases are now version ${d.version}; earlier versions are kept.`);
    onChanged();
  }

  return (
    <div className="mt-3">
      <button className="text-sm text-accent underline" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide test cases" : `Manage test cases (${cases.length})`}
      </button>
      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-edge text-sm">
          <ul className="max-h-96 divide-y divide-edge overflow-y-auto">
            {cases.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-2">
                <input type="checkbox" className="mt-1" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.id}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{c.id}</span>
                    <span className="text-xs text-muted">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                    {overrides[c.example_input ? `example:${c.example_input}` : c.id]?.why && (
                      <span className="rounded bg-accent/15 px-1.5 text-[11px] text-accent">{overrides[c.example_input ? `example:${c.example_input}` : c.id].why}</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-fg/80" title={c.turns.join(" → ")}>{c.turns.join(" → ")}</p>
                  <p className="truncate text-xs text-muted" title={c.expected}>Should: {c.expected}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-edge bg-ink/40 px-3 py-2">
            {!confirming ? (
              <button
                className="rounded-lg border border-bad/50 px-3 py-1.5 text-sm font-semibold text-bad hover:bg-bad/10 disabled:opacity-40"
                disabled={!picked.size || busy || working}
                onClick={() => setConfirming(true)}
              >
                Remove selected ({picked.size})
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-warn/50 bg-warn/10 p-3">
                <p className="font-semibold text-warn">⚠ You&apos;re about to remove {picked.size} test case{picked.size === 1 ? "" : "s"}.</p>
                <p className="text-fg/90">
                  Your agent won&apos;t be tested on {picked.size === 1 ? "it" : "them"} anymore, so a mistake {picked.size === 1 ? "it" : "they"} would
                  have caught can reach your users. This makes a new version of your test cases; the current one stays in the history.
                  {attacks > 0 && <span className="font-medium text-bad"> {attacks} of them test{attacks === 1 ? "s" : ""} attacks on your agent.</span>}
                </p>
                <div className="flex gap-2">
                  <button className="rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90" disabled={working} onClick={remove}>
                    {working ? "Removing…" : "Yes, remove them"}
                  </button>
                  <button className="btn-ghost text-sm" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            )}
            {msg && <p className="text-xs text-muted">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** A Fix it result: what changed, and whether the failing cases were re-run and now pass (and on which try). */
type FixInfo = { summary: string; verified?: boolean; tries?: number };
