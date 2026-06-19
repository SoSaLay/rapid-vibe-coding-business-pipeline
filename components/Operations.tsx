"use client";

import { useMemo, useState } from "react";
import { Cadence, CADENCE_LABEL, isDue, resetsIn } from "@/lib/ops-cadence";

interface OpsCheck {
  id: string;
  title: string;
  how: string;
  cadence: Cadence;
}
interface OpsTool {
  name: string;
  url: string;
  role: string;
  checks: OpsCheck[];
}
interface StepItem {
  step: string;
  detail: string;
}
interface OpsReport {
  summary: string;
  tools: OpsTool[];
  release_process: StepItem[];
  incident_response: StepItem[];
}
type CheckLog = Record<string, string>;

const CADENCE_BADGE: Record<Cadence, string> = {
  daily: "bg-bad/15 text-bad",
  weekly: "bg-warn/15 text-warn",
  monthly: "bg-accent/15 text-accent",
};

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-medium text-fg">{title}</span>
        <span className="text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t border-fg/5 px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

function StepList({ steps }: { steps: StepItem[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex-none w-5 h-5 rounded-full bg-fg/10 flex items-center justify-center text-[10px] font-bold text-muted">
            {i + 1}
          </span>
          <span>
            <span className="font-medium text-fg">{s.step}</span>
            {s.detail && <span className="text-muted"> — {s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Operations({
  projectId,
  hasDeploy,
  state,
  report,
  onUpdated,
}: {
  projectId: string;
  hasDeploy: boolean;
  state: { report?: OpsReport | null; prod_url?: string; checkLog?: CheckLog } | null;
  report: (OpsReport & { signed_off_at?: string }) | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local mirror so taps feel instant on the phone; server stays authoritative via onUpdated.
  const [localLog, setLocalLog] = useState<CheckLog | null>(null);

  // The live loop always runs off phase state (checkLog lives there); the
  // artifact copy only proves sign-off happened.
  const opsReport = state?.report ?? report ?? null;
  const isComplete = !!report;
  const checkLog = localLog ?? state?.checkLog ?? {};
  const nowIso = new Date().toISOString();

  const dueCounts = useMemo(() => {
    const counts: Record<Cadence, number> = { daily: 0, weekly: 0, monthly: 0 };
    for (const tool of opsReport?.tools ?? []) {
      for (const c of tool.checks) {
        if (isDue(c.cadence, checkLog[c.id], nowIso)) counts[c.cadence]++;
      }
    }
    return counts;
  }, [opsReport, checkLog, nowIso]);
  const totalDue = dueCounts.daily + dueCounts.weekly + dueCounts.monthly;

  async function generatePlan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/operations/plan`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate ops report.");
      setLocalLog(null);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCheck(item: OpsCheck) {
    const due = isDue(item.cadence, checkLog[item.id], nowIso);
    const next = { ...checkLog };
    if (due) next[item.id] = nowIso;
    else delete next[item.id];
    setLocalLog(next);
    try {
      const res = await fetch(`/api/projects/${projectId}/operations/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, done: due }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save.");
      }
      onUpdated();
    } catch (e: any) {
      setLocalLog(null); // roll back the optimistic tap
      setError(e.message);
    }
  }

  async function signOff() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/operations/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to sign off.");
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/operations/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to skip.");
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!hasDeploy) {
    return (
      <div className="card p-6 text-sm text-muted">
        Deployment must be complete before setting up operations.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isComplete && (
        <div className="card p-3 flex items-center gap-2 text-sm text-ok">
          <span>✓</span>
          <span>
            Operations signed off
            {report?.signed_off_at ? ` on ${report.signed_off_at.slice(0, 10)}` : ""}. The recurring
            checklist below keeps running.
          </span>
        </div>
      )}

      {error && <div className="card p-3 text-sm text-bad">{error}</div>}

      {!opsReport && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Generate your ops playbook — a recurring checklist tailored to the exact tools you
            deployed with (what to check in each console, daily / weekly / monthly, with timers),
            plus a release process and incident response runbook.
          </p>
          <div className="flex gap-3">
            <button onClick={generatePlan} disabled={busy} className="btn-primary text-sm">
              {busy ? "Generating…" : "Generate Ops Report"}
            </button>
            <button onClick={skip} disabled={busy} className="btn-ghost text-sm">
              Skip
            </button>
          </div>
        </div>
      )}

      {opsReport && (
        <>
          {/* Summary */}
          <div className="card p-4">
            <p className="text-sm text-fg/90">{opsReport.summary}</p>
          </div>

          {/* Due-now rollup */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-fg">
                {totalDue === 0 ? "All caught up ✓" : `${totalDue} check${totalDue === 1 ? "" : "s"} due`}
              </span>
              <div className="flex gap-2 text-[10px]">
                {(Object.keys(dueCounts) as Cadence[]).map((c) =>
                  dueCounts[c] > 0 ? (
                    <span key={c} className={`rounded px-2 py-0.5 font-semibold ${CADENCE_BADGE[c]}`}>
                      {dueCounts[c]} {CADENCE_LABEL[c].toLowerCase()}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          </div>

          {/* Tool groups — the living checklist */}
          {opsReport.tools.map((tool, ti) => {
            const toolDue = tool.checks.filter((c) => isDue(c.cadence, checkLog[c.id], nowIso)).length;
            return (
              <div key={ti} className="card overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-fg/5">
                  <div>
                    <div className="text-sm font-medium text-fg">{tool.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{tool.role}</div>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    {toolDue > 0 && (
                      <span className="rounded bg-fg/10 px-2 py-0.5 text-[10px] text-muted">
                        {toolDue} due
                      </span>
                    )}
                    {tool.url?.startsWith("http") && (
                      <a
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-fg/5 px-3 py-1.5 text-xs text-accent hover:bg-fg/10"
                      >
                        Open ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {tool.checks.map((c) => {
                    const due = isDue(c.cadence, checkLog[c.id], nowIso);
                    const countdown = resetsIn(c.cadence, checkLog[c.id], nowIso);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCheck(c)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-fg/5"
                      >
                        <span
                          className={`mt-0.5 flex-none w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${
                            due ? "border-fg/25 text-transparent" : "border-ok/60 bg-ok/15 text-ok"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm ${due ? "text-fg" : "text-muted line-through"}`}>
                              {c.title}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CADENCE_BADGE[c.cadence]}`}>
                              {CADENCE_LABEL[c.cadence]}
                            </span>
                            {!due && countdown && (
                              <span className="text-[10px] text-muted">resets in {countdown}</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">{c.how}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Runbooks */}
          {opsReport.release_process?.length > 0 && (
            <Section title="Release Process">
              <StepList steps={opsReport.release_process} />
            </Section>
          )}
          {opsReport.incident_response?.length > 0 && (
            <Section title="Incident Response">
              <StepList steps={opsReport.incident_response} />
            </Section>
          )}

          {/* Sign-off */}
          {!isComplete && (
            <div className="card p-4 space-y-3">
              <p className="text-sm text-muted">
                Sign off to lock the <code className="text-xs">ops-report</code> artifact and unlock
                Iteration. The checklist keeps running afterwards — ops never finishes.
              </p>
              <div className="flex gap-3">
                <button onClick={signOff} disabled={busy} className="btn-primary text-sm">
                  {busy ? "Signing off…" : "Sign Off"}
                </button>
                <button onClick={generatePlan} disabled={busy} className="btn-ghost text-sm">
                  Regenerate
                </button>
                <button onClick={skip} disabled={busy} className="btn-ghost text-sm">
                  Skip
                </button>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="card p-4">
              <button onClick={generatePlan} disabled={busy} className="btn-ghost text-sm">
                {busy ? "Regenerating…" : "Regenerate Ops Report"}
              </button>
              <p className="mt-2 text-xs text-muted">
                Regenerating builds a fresh checklist (timers reset) and rewrites OPS-GUIDE.md.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
