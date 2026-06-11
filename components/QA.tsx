"use client";

import { useCallback, useEffect, useState } from "react";

interface QaCase {
  id: string;
  area: string;
  title: string;
  steps: string[];
  expected: string;
  kind: string;
}
interface QaSecurityCheck {
  id: string;
  owasp: string;
  title: string;
  verify: string;
}
interface QaManualItem {
  id: string;
  title: string;
  instructions: string;
  why_human: string;
}
interface QaPlan {
  scope_summary: string;
  test_cases: QaCase[];
  security_checks: QaSecurityCheck[];
  manual_checklist: QaManualItem[];
  exit_criteria: string[];
}
interface ManualResponse {
  id: string;
  status: "pass" | "fail" | "na";
  note?: string;
}
interface QaResults {
  completed_at: string | null;
  suite: { typecheck: string; tests: string; build: string } | null;
  cases: { id: string; status: string; notes?: string }[];
  security: { id: string; status: string; notes?: string }[];
  npm_audit: { critical: number; high: number; moderate: number } | null;
  fixed_during_qa: string[];
}
interface QaReport {
  verdict: string;
  forced: boolean;
  blockers_at_signoff: string[];
  scope_summary: string;
  cases: { total: number; passed: number; failed: number; skipped: number };
  security: { total: number; passed: number; failed: number; na: number; findings: any[] };
  npm_audit: { critical: number; high: number; moderate: number } | null;
  open_defects: { id: string; title: string; notes?: string }[];
  fix_rounds: number;
}

export function QA({
  projectId,
  hasManifest,
  state,
  report,
  onUpdated,
}: {
  projectId: string;
  hasManifest: boolean;
  state: { plan?: QaPlan | null; manual?: ManualResponse[]; fixRound?: number; startCommand?: string } | null;
  report: QaReport | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: any): Promise<any | null> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/qa/${path}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Request failed.");
      return null;
    }
    onUpdated();
    return d;
  }

  if (!hasManifest) {
    return <div className="card p-6 text-sm text-muted">Locked until the build completes (Engineering phase).</div>;
  }

  if (report) return <ReportView report={report} />;

  const plan = state?.plan ?? null;
  if (!plan) {
    return (
      <div className="card p-6 space-y-4">
        <p className="text-sm text-muted text-center">
          The QA lead reads your spec, design, and build, then writes the test plan: automated cases for your coding
          agent, an OWASP-mapped security checklist, and a short manual checklist only you can judge. You run one
          command and tap through the manual items — the pipeline tracks the rest.
        </p>
        <div className="flex justify-center">
          <button className="btn-primary" disabled={busy} onClick={() => post("plan")}>
            {busy ? "Writing the QA plan…" : "Generate QA plan"}
          </button>
        </div>
        {error && <p className="text-sm text-bad text-center">{error}</p>}
      </div>
    );
  }

  return (
    <QaRunView
      projectId={projectId}
      plan={plan}
      manual={state?.manual ?? []}
      fixRound={state?.fixRound ?? 0}
      startCommand={state?.startCommand ?? ""}
      busy={busy}
      error={error}
      post={post}
    />
  );
}

/* ---------------- Shared bits ---------------- */

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Copyable({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-accent2 hover:text-white"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "copied ✓" : label || "copy"}
    </button>
  );
}

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const cls = ok === null ? "bg-edge/60 text-muted" : ok ? "bg-ok/20 text-ok" : "bg-bad/20 text-bad";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${cls}`}>{label}</span>;
}

/* ---------------- The QA run (plan → automated → manual → sign-off) ---------------- */

function QaRunView({
  projectId,
  plan,
  manual,
  fixRound,
  startCommand,
  busy,
  error,
  post,
}: {
  projectId: string;
  plan: QaPlan;
  manual: ManualResponse[];
  fixRound: number;
  startCommand: string;
  busy: boolean;
  error: string | null;
  post: (path: string, body?: any) => Promise<any | null>;
}) {
  const [results, setResults] = useState<QaResults | null>(null);
  const [commits, setCommits] = useState<string[]>([]);
  const [exit, setExit] = useState<{ ready: boolean; blockers: string[] } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/qa/progress`);
    if (!res.ok) return;
    const d = await res.json();
    setResults(d.results);
    setCommits(d.commits || []);
    setExit(d.exit || null);
  }, [projectId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh, manual]);

  const failedCases = (results?.cases ?? []).filter((c) => c.status === "fail");
  const failedSec = (results?.security ?? []).filter((s) => s.status === "fail");
  const manualFails = manual.filter((m) => m.status === "fail");
  const defects = [
    ...failedCases.map((c) => ({ id: c.id, title: plan.test_cases.find((t) => t.id === c.id)?.title ?? c.id, notes: c.notes })),
    ...failedSec.map((s) => ({ id: s.id, title: plan.security_checks.find((c) => c.id === s.id)?.title ?? s.id, notes: s.notes })),
    ...manualFails.map((m) => ({ id: m.id, title: plan.manual_checklist.find((i) => i.id === m.id)?.title ?? m.id, notes: m.note })),
  ];

  return (
    <div className="space-y-4">
      <Section title="QA plan">
        <p className="text-sm text-white/90">{plan.scope_summary}</p>
        <p className="mt-2 text-xs text-muted">
          {plan.test_cases.length} automated cases · {plan.security_checks.length} security checks ·{" "}
          {plan.manual_checklist.length} manual items{fixRound > 0 ? ` · fix round ${fixRound}` : ""}
        </p>
      </Section>

      <Section title="Run automated QA" action={<Copyable text={startCommand} label="copy command" />}>
        <p className="text-xs text-muted mb-2">
          Open a terminal, paste this, and your coding agent runs the whole automated pass — writing any missing
          tests, attacking the security checklist, and reporting back here. Re-run it after every fix round.
        </p>
        <pre className="rounded bg-ink p-2.5 text-xs text-white/90 overflow-x-auto">{startCommand}</pre>
      </Section>

      <Section
        title="Automated results"
        action={
          <button className="text-[11px] text-accent2 hover:text-white" onClick={refresh}>
            refresh
          </button>
        }
      >
        {!results ? (
          <p className="text-xs text-muted">Waiting for the agent to write qa/results.json… (polls every 20s)</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill ok={results.suite ? results.suite.typecheck === "pass" : null} label={`typecheck ${results.suite?.typecheck ?? "—"}`} />
              <StatusPill ok={results.suite ? results.suite.tests !== "fail" : null} label={`tests ${results.suite?.tests ?? "—"}`} />
              <StatusPill ok={results.suite ? results.suite.build === "pass" : null} label={`build ${results.suite?.build ?? "—"}`} />
              {results.npm_audit && (
                <StatusPill ok={results.npm_audit.critical === 0} label={`audit ${results.npm_audit.critical} critical / ${results.npm_audit.high} high`} />
              )}
            </div>
            <p className="mt-2 text-xs text-white/80">
              Cases: {(results.cases ?? []).filter((c) => c.status === "pass").length} pass · {failedCases.length} fail ·{" "}
              {(results.cases ?? []).filter((c) => c.status === "skip").length} skip — Security:{" "}
              {(results.security ?? []).filter((s) => s.status === "pass").length} pass · {failedSec.length} fail ·{" "}
              {(results.security ?? []).filter((s) => s.status === "na").length} n/a
            </p>
            {[...failedCases, ...failedSec].map((f) => (
              <p key={f.id} className="mt-1 text-[11px] text-bad">
                ✗ {f.id}: {f.notes || "failed"}
              </p>
            ))}
            {results.fixed_during_qa.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">Fixed during QA: {results.fixed_during_qa.join(" · ")}</p>
            )}
          </>
        )}
        {commits.length > 0 && (
          <div className="mt-3 rounded bg-ink/60 p-2">
            {commits.map((c, i) => (
              <p key={i} className="text-[10px] text-muted font-mono truncate">
                {c}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Manual checklist — your pass (${manual.length}/${plan.manual_checklist.length})`}>
        <p className="text-xs text-muted mb-3">
          The judgment calls only a human can make. Do each one on your phone, then tap the result.
        </p>
        <div className="space-y-3">
          {plan.manual_checklist.map((item) => (
            <ManualItemRow
              key={item.id}
              item={item}
              response={manual.find((r) => r.id === item.id) ?? null}
              busy={busy}
              onAnswer={(r) => post("manual", { responses: [r] })}
            />
          ))}
        </div>
      </Section>

      {defects.length > 0 && (
        <Section title={`Defects (${defects.length})`}>
          <div className="space-y-1 mb-3">
            {defects.map((d) => (
              <p key={d.id} className="text-xs text-white/85">
                <span className="text-bad">✗ {d.id}</span> {d.title}
                {d.notes ? <span className="text-muted"> — {d.notes}</span> : null}
              </p>
            ))}
          </div>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={async () => {
              const d = await post("defects", { defects });
              if (d) await refresh();
            }}
          >
            {busy ? "Sending…" : "Send fixes to builder →"}
          </button>
          <p className="mt-2 text-[11px] text-muted">
            Appends a fix round to the app's TASKS.md. Run the build command to fix, then re-run the QA pass.
          </p>
        </Section>
      )}

      <Section title="Sign-off">
        {exit?.ready ? (
          <p className="text-xs text-ok mb-2">All exit criteria met. Sign off to unlock Deployment.</p>
        ) : (
          <ul className="mb-2 space-y-0.5">
            {(exit?.blockers ?? ["Evaluating…"]).map((b, i) => (
              <li key={i} className="text-[11px] text-warn">
                · {b}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !exit?.ready} onClick={() => post("complete")}>
            {busy ? "Signing off…" : "Sign off → unlock Deployment"}
          </button>
          {exit && !exit.ready && (
            <button className="btn-ghost" disabled={busy} onClick={() => post("complete", { force: true })}>
              Sign off anyway
            </button>
          )}
        </div>
      </Section>

      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function ManualItemRow({
  item,
  response,
  busy,
  onAnswer,
}: {
  item: QaManualItem;
  response: ManualResponse | null;
  busy: boolean;
  onAnswer: (r: ManualResponse) => void;
}) {
  const [note, setNote] = useState(response?.note ?? "");
  const status = response?.status ?? null;

  function answer(s: "pass" | "fail" | "na") {
    onAnswer({ id: item.id, status: s, note: note.trim() || undefined });
  }

  return (
    <div className="rounded-lg border border-edge p-3">
      <div className="text-xs font-medium text-white">
        {item.id} — {item.title}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{item.instructions}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(["pass", "fail", "na"] as const).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => answer(s)}
            className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
              status === s
                ? s === "pass"
                  ? "bg-ok text-ink font-semibold"
                  : s === "fail"
                    ? "bg-bad text-white font-semibold"
                    : "bg-edge text-white font-semibold"
                : "border border-edge text-muted hover:text-white"
            }`}
          >
            {s === "na" ? "n/a" : s}
          </button>
        ))}
        <input
          className="ml-1 flex-1 min-w-[120px] rounded bg-ink px-2 py-1 text-[11px] text-white placeholder:text-muted/60 border border-edge"
          placeholder="note (optional — required context for fails)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => status && answer(status)}
        />
      </div>
    </div>
  );
}

/* ---------------- Signed-off report ---------------- */

function ReportView({ report }: { report: QaReport }) {
  const ship = report.verdict === "ship";
  return (
    <div className="space-y-4">
      <div className={`card p-4 border ${ship ? "border-ok/30" : "border-warn/30"}`}>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${ship ? "bg-ok text-ink" : "bg-warn text-ink"}`}>
          {ship ? "ship" : "ship with warnings"}
        </span>
        <span className="ml-3 text-xs text-muted">
          {report.cases.passed}/{report.cases.total} cases · {report.security.passed + report.security.na}/
          {report.security.total} security · {report.fix_rounds} fix round{report.fix_rounds === 1 ? "" : "s"} ·
          Deployment unlocked
        </span>
      </div>

      {report.forced && report.blockers_at_signoff.length > 0 && (
        <Section title="Signed off with open blockers">
          <ul className="space-y-0.5">
            {report.blockers_at_signoff.map((b, i) => (
              <li key={i} className="text-[11px] text-warn">
                · {b}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Summary">
        <p className="text-sm text-white/90">{report.scope_summary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusPill ok={report.cases.failed === 0} label={`cases ${report.cases.passed} pass / ${report.cases.failed} fail / ${report.cases.skipped} skip`} />
          <StatusPill ok={report.security.failed === 0} label={`security ${report.security.passed} pass / ${report.security.failed} fail / ${report.security.na} n/a`} />
          {report.npm_audit && (
            <StatusPill ok={report.npm_audit.critical === 0} label={`audit ${report.npm_audit.critical} critical / ${report.npm_audit.high} high`} />
          )}
        </div>
      </Section>

      {report.security.findings.length > 0 && (
        <Section title="Security findings">
          {report.security.findings.map((f: any) => (
            <p key={f.id} className="text-xs text-bad">
              ✗ {f.id} {f.title}
              {f.notes ? <span className="text-muted"> — {f.notes}</span> : null}
            </p>
          ))}
        </Section>
      )}

      {report.open_defects.length > 0 && (
        <Section title="Open defects (carried into Deployment)">
          {report.open_defects.map((d) => (
            <p key={d.id} className="text-xs text-white/85">
              <span className="text-warn">⚠ {d.id}</span> {d.title}
              {d.notes ? <span className="text-muted"> — {d.notes}</span> : null}
            </p>
          ))}
        </Section>
      )}
    </div>
  );
}
