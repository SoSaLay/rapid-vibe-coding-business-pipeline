"use client";

import { useEffect, useRef, useState } from "react";
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
  const [trials, setTrials] = useState(3);
  const [override, setOverride] = useState("");
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const stopper = useStopper();
  const autoRan = useRef(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!autostart || !hasSecurity || !loaded || autoRan.current || (state?.runs?.length ?? 0) > 0) return;
    autoRan.current = true;
    (async () => {
      if (!cases) await post("dataset", {}, "Writing test cases…");
      await post("run", { trials: 3 }, "Running the evaluations (a few minutes)…");
    })();
  }, [autostart, hasSecurity, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/projects/${projectId}/evals/dataset`)
      .then((r) => r.json())
      .then((d) => setCases(d.dataset?.cases ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId, state?.dataset_version]);

  async function post(path: string, body: any, label: string) {
    setBusy(label);
    setError(null);
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
        if (d.output) setLog(d.output);
      } else onUpdated();
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Request failed.");
    }
    setBusy(null);
  }

  if (!hasSecurity) return <StageStart label="Start Evaluations" locked="Finish Security first." onStart={() => {}} />;

  const runs = state?.runs ?? [];
  const last: EvalRun | undefined = runs[runs.length - 1];
  const baseline = state?.baseline ?? null;
  const caseCount = cases?.length ?? 0;

  async function startAll() {
    if (!cases) await post("dataset", {}, "Writing test cases…");
    await post("run", { trials: 3 }, "Running the evaluations (a few minutes)…");
  }
  if (loaded && !cases && runs.length === 0) {
    return <StageStart label="Start Evaluations" busy={busy} error={error} onStart={startAll} onStop={() => { stopper.stop(); setBusy(null); }} />;
  }

  return (
    <Doc>
      <DocSection title="How it's tested">
        <DocP>
          Every case runs several times, because AI answers vary. Writes run in dry run, and each tool returns test data, so nothing
          real is touched. Each run is scored on whether the task got done, whether the right tools were used, and whether it stayed
          safe. The first passing run becomes the baseline, and every later run must not fall below it.
        </DocP>
      </DocSection>

      <DocSection title="Test cases">
        {cases ? (
          <>
            <DocFacts
              items={[
                { label: "Dataset", value: `Version ${state?.dataset_version ?? "—"} · ${caseCount} cases` },
                ...Object.entries(state?.dataset_counts ?? {}).map(([k, v]) => ({ label: CATEGORY_LABEL[k] ?? k, value: String(v) })),
              ]}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-fg">See every case</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {cases.map((c) => (
                  <li key={c.id}>
                    <span className="text-xs text-muted">{CATEGORY_LABEL[c.category] ?? c.category} · {c.suite}</span>
                    <div className="text-fg">{c.turns.join(" → ")}</div>
                    <DocMuted>Expected: {c.expected}</DocMuted>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <DocMuted>No test cases yet. They start from your example tasks, plus harder cases built from the design and the security threat model.</DocMuted>
        )}
        <div className="mt-4">
          <button className="btn-ghost" disabled={!!busy} onClick={() => post("dataset", {}, "Writing test cases…")}>
            {cases ? "Make a new dataset version" : "Build test cases →"}
          </button>
        </div>
      </DocSection>

      {cases && (
        <DocSection title="Run">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor="trials" className="text-fg">Tries per case</label>
            <select id="trials" className="input h-9 w-20" value={trials} onChange={(e) => setTrials(Number(e.target.value))}>
              {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-muted">{caseCount * trials} agent runs{baseline?.cost_per_run ? ` · about $${(baseline.cost_per_run * caseCount * trials).toFixed(2)}` : ""}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {busy ? (
              <>
                <span className="text-sm text-muted">{busy}</span>
                <StopButton onStop={() => { stopper.stop(); setBusy(null); }} />
              </>
            ) : (
              <button className="btn-primary" onClick={() => post("run", { trials }, `Running ${caseCount * trials} agent runs (a few minutes)…`)}>
                Run evaluations →
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          {log && <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{log}</pre>}
        </DocSection>
      )}

      {last && (
        <>
          <DocSection title="Release gate">
            <div className={`card mb-3 p-3 text-sm ${last.passed ? "border border-ok/30" : "border border-bad/30"}`}>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold text-onbright ${last.passed ? "bg-ok" : "bg-bad"}`}>
                {last.passed ? "passes" : "blocked"}
              </span>
              <span className="ml-3 text-xs text-muted">Run {new Date(last.at).toLocaleString()} · dataset v{last.summary.dataset_version} · {last.summary.trials} tries per case</span>
            </div>
            <ul className="space-y-2 text-sm">
              {last.gate.map((g) => (
                <li key={g.label}>
                  <span className={g.ok ? "text-ok" : "text-bad"}>{g.ok ? "✓" : "✗"}</span> <span className="text-fg">{g.label}</span>
                  <DocMuted>{g.detail}</DocMuted>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {completed ? (
                <span className="text-sm text-ok">Evaluations recorded. Deployment is unlocked.</span>
              ) : last.passed ? (
                <button className="btn-primary" disabled={!!busy} onClick={() => post("complete", {}, "Finishing…")}>Finish → Deployment</button>
              ) : (
                <>
                  <input
                    className="input h-9 min-w-0 flex-1 text-sm"
                    placeholder="Release anyway? Write why (kept in the report)"
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                  />
                  <button className="btn-ghost" disabled={!!busy || !override.trim()} onClick={() => post("complete", { override }, "Finishing…")}>
                    Override → Deployment
                  </button>
                </>
              )}
              {last.passed && baseline && state?.baseline_at !== last.at && (
                <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => post("pin", {}, "Pinning…")}>Make this the new baseline</button>
              )}
            </div>
          </DocSection>

          <DocSection title="Results">
            <Metrics s={last.summary} base={baseline && state?.baseline_at !== last.at ? baseline : null} />
            {last.summary.failing_cases.length > 0 && (
              <>
                <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Cases that failed at least once</div>
                <ul className="mt-2 space-y-2 text-sm">
                  {last.summary.failing_cases.map((f) => (
                    <li key={f.case}>
                      <span className="text-bad">{f.passed_trials}/{f.trials}</span> <code className="text-fg">{f.case}</code>{" "}
                      <span className="text-xs text-muted">{CATEGORY_LABEL[f.category] ?? f.category}</span>
                      <DocMuted>{f.reason}</DocMuted>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DocSection>
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
      <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">By kind of case</div>
      <ul className="mt-2 space-y-1 text-sm">
        {Object.entries(s.categories).map(([k, r]) => (
          <li key={k} className="flex justify-between gap-3">
            <span className="text-fg">{CATEGORY_LABEL[k] ?? k}</span>
            <span className={r.rate === 1 ? "text-ok" : r.rate >= 0.5 ? "text-warn" : "text-bad"}>{r.passed}/{r.total}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
