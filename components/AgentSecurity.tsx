"use client";

import { useState } from "react";
import type { SecurityReport, CheckStatus } from "@/lib/phases/agent-security";
import { Doc, DocSection, DocP, DocMuted } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";

const BADGE: Record<CheckStatus, { text: string; cls: string }> = {
  pass: { text: "Pass", cls: "bg-ok text-onbright" },
  fail: { text: "Fail", cls: "bg-bad text-onbright" },
  deferred: { text: "At deployment", cls: "bg-edge text-muted" },
  exception: { text: "Signed off", cls: "bg-warn text-onbright" },
};

/** Agent pipeline — stage 4. Threat model + scored checklist; gates Evaluations. */
export function AgentSecurity({
  projectId,
  hasBuild,
  report,
  completed,
  onUpdated,
}: {
  projectId: string;
  hasBuild: boolean;
  report: SecurityReport | null;
  completed: boolean;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const stopper = useStopper();

  async function post(path: string, body?: any) {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/security/${path}`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "Request failed.");
      else onUpdated();
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Request failed.");
    }
  }

  async function run() {
    setBusy("Reviewing the design and code for risks…");
    await post("run");
    setBusy(null);
  }

  if (!hasBuild) return <div className="card p-6 text-sm text-muted">Locked until Engineering & Development is finished.</div>;

  if (!report) {
    return (
      <div className="card space-y-4 p-6 text-center">
        <p className="text-sm text-muted">
          Checks your agent for prompt injection and tool misuse, then scores a security checklist against the actual code. Anything
          that fails needs a fix or your written sign-off before Evaluations.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={run}>{busy ?? "Run security review →"}</button>
          {busy && <StopButton onStop={() => { stopper.stop(); setBusy(null); }} />}
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    );
  }

  const failing = report.checks.filter((c) => c.status === "fail").length;

  return (
    <Doc>
      <DocSection title="Checklist">
        <DocP>
          {failing
            ? `${failing} item(s) need a fix or your sign-off. To fix one, change the Agent Design, rebuild, then re-run this review.`
            : "Nothing is failing. Items marked “At deployment” only exist once the agent is hosted; they're checked again there."}
        </DocP>
        <ul className="mt-3 space-y-3">
          {report.checks.map((c) => (
            <li key={c.id} className="rounded-lg border border-edge p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[c.status].cls}`}>{BADGE[c.status].text}</span>
                <span className="font-medium text-fg">{c.label}</span>
              </div>
              <DocMuted className="mt-1">{c.detail}</DocMuted>
              {c.status === "exception" && (
                <div className="mt-2 text-xs">
                  <span className="text-fg">Your sign-off:</span> <span className="text-muted">{c.exception_note}</span>{" "}
                  <button className="text-accent underline" onClick={() => post("exception", { id: c.id, note: "" })}>Withdraw</button>
                </div>
              )}
              {c.status === "fail" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className="input h-8 min-w-0 flex-1 text-xs"
                    placeholder="Accept the risk? Write why (e.g. internal use only)"
                    value={notes[c.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                  />
                  <button className="btn-ghost text-xs" disabled={!notes[c.id]?.trim()} onClick={() => post("exception", { id: c.id, note: notes[c.id] })}>
                    Sign off
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" disabled={!!busy} onClick={run}>{busy ?? "Re-run review"}</button>
          {completed ? (
            <span className="text-sm text-ok">Security passed. Evaluations is unlocked.</span>
          ) : (
            <button className="btn-primary" disabled={!!busy || failing > 0} onClick={() => post("complete")}>Finish → Evaluations</button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </DocSection>

      <DocSection title="Threat model">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Where untrusted text gets in</div>
        <ul className="mt-2 space-y-3 text-sm">
          {report.threat_model.entry_points.map((e, i) => (
            <li key={i}>
              <span className={e.mitigated ? "text-ok" : "text-bad"}>{e.mitigated ? "✓" : "✗"}</span>{" "}
              <span className="font-medium text-fg">{e.source}</span>
              <DocMuted>Risk: {e.injected_instruction_could}</DocMuted>
              <DocMuted>Control: {e.control}</DocMuted>
            </li>
          ))}
        </ul>
        <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Worst misuse of each tool</div>
        <ul className="mt-2 space-y-3 text-sm">
          {report.threat_model.tool_misuse.map((t, i) => (
            <li key={i}>
              <code className="text-fg">{t.tool}</code>
              <DocMuted>Risk: {t.worst_misuse}</DocMuted>
              <DocMuted>Control: {t.control}</DocMuted>
            </li>
          ))}
        </ul>
      </DocSection>
    </Doc>
  );
}
