"use client";

import { useState } from "react";
import { VoiceInput } from "./VoiceInput";

interface CheckinQuestion {
  id: string;
  question: string;
  why: string;
  kind: "core" | "app";
}
interface PulledSignal {
  label: string;
  value: string;
}
interface NextMove {
  id: string;
  title: string;
  type: "growth" | "product" | "fix";
  why: string;
  expected_impact: string;
  effort: "small" | "medium" | "large";
}
interface IterationBrief {
  traction_read: {
    verdict: "strong" | "promising" | "weak" | "too-early";
    summary: string;
    whats_working: string[];
    whats_not: string[];
    data_gaps: string[];
  };
  next_moves: NextMove[];
  recommended_focus: string[];
  open_questions: string[];
}
interface IterationState {
  questions?: CheckinQuestion[];
  signals?: PulledSignal[];
  answers?: Record<string, string>;
  brief?: IterationBrief | null;
  lastDecision?: string;
}

const VERDICT_STYLE: Record<string, string> = {
  strong: "bg-ok/15 text-ok",
  promising: "bg-accent/15 text-accent",
  weak: "bg-bad/15 text-bad",
  "too-early": "bg-warn/15 text-warn",
};
const MOVE_BADGE: Record<string, string> = {
  growth: "bg-purple-500/15 text-purple-400",
  product: "bg-accent/15 text-accent",
  fix: "bg-bad/15 text-bad",
};

export function Iteration({
  projectId,
  hasDeploy,
  state,
  cycle,
  archived,
  onUpdated,
}: {
  projectId: string;
  hasDeploy: boolean;
  state: IterationState | null;
  cycle: number;
  archived: boolean;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(state?.answers ?? {});
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [cycleStarted, setCycleStarted] = useState(false);

  const questions = state?.questions ?? [];
  const signals = state?.signals ?? [];
  const brief = state?.brief ?? null;
  const selectedFocus = focusIds ?? brief?.recommended_focus ?? [];

  async function post(path: string, body?: any) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/iteration/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed.");
      return json;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startCheckin() {
    const ok = await post("checkin");
    if (ok) onUpdated();
  }

  async function synthesize() {
    const ok = await post("synthesize", { answers });
    if (ok) onUpdated();
  }

  async function decide(decision: string, extra?: any) {
    const ok = await post("decide", { decision, ...extra });
    if (ok) {
      if (decision === "next-cycle") setCycleStarted(true);
      onUpdated();
    }
  }

  function toggleFocus(id: string) {
    const next = selectedFocus.includes(id)
      ? selectedFocus.filter((f) => f !== id)
      : [...selectedFocus, id].slice(0, 3);
    setFocusIds(next);
  }

  if (!hasDeploy) {
    return (
      <div className="card p-6 text-sm text-muted">
        Iteration needs a live product — complete Deployment first.
      </div>
    );
  }

  if (archived) {
    return (
      <div className="card p-6 space-y-3">
        <div className="text-sm text-bad">This project is archived — the pipeline is stopped.</div>
        <p className="text-xs text-muted">
          Nothing was deleted: every artifact, spec, and learning is still on disk. Remember the
          deployed app itself is still live on your hosting — shut it down there if you want it gone.
        </p>
        <button
          className="btn-ghost text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/projects/${projectId}/archive`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archived: false }),
            });
            setBusy(false);
            onUpdated();
          }}
        >
          Unarchive — resume the pipeline
        </button>
      </div>
    );
  }

  if (cycleStarted) {
    return (
      <div className="card p-6 space-y-2">
        <div className="text-sm text-ok">✓ Cycle {cycle + 1} started.</div>
        <p className="text-sm text-muted">
          The Product Owner is re-opened with your check-in data and chosen focus. Head there to run
          the pushback dialogue — it will produce spec v{cycle + 1} and the pipeline flows from there.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="card p-3 text-sm text-bad">{error}</div>}

      <div className="card p-3 text-xs text-muted">
        Cycle {cycle} · The business is never finished until you say so — check in on the data,
        pick the next moves, and loop.
      </div>

      {/* Stage 1: start */}
      {questions.length === 0 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Your product is live and producing real signal. Start a check-in: the questions a product
            owner needs answered (plus a few specific to your app), answered by voice or typing — then
            get an honest traction read and ranked next moves.
          </p>
          <button onClick={startCheckin} disabled={busy} className="btn-primary text-sm">
            {busy ? "Preparing questions…" : "Start check-in"}
          </button>
        </div>
      )}

      {/* Auto-pulled signals */}
      {signals.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            What the pipeline already knows
          </div>
          {signals.map((s, i) => (
            <div key={i} className="text-sm">
              <span className="text-muted">{s.label}:</span>{" "}
              <span className="text-fg/90">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stage 1: questions */}
      {questions.length > 0 && !brief && (
        <>
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="card p-4 space-y-2">
                <div className="text-sm font-medium text-fg">{q.question}</div>
                <div className="text-xs text-muted">{q.why}</div>
                <textarea
                  className="input min-h-[64px] w-full resize-y text-sm"
                  placeholder="Type, or use the mic…"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
                <VoiceInput
                  label="Speak your answer"
                  onTranscript={(t) => setAnswers((prev) => ({ ...prev, [q.id]: t }))}
                />
              </div>
            ))}
          </div>
          <div className="card p-4 space-y-3">
            <p className="text-xs text-muted">
              Answer what you can — skip what you don't know yet; gaps are data too.
            </p>
            <div className="flex gap-3">
              <button onClick={synthesize} disabled={busy} className="btn-primary text-sm">
                {busy ? "Analyzing…" : "Get my iteration brief"}
              </button>
              <button onClick={startCheckin} disabled={busy} className="btn-ghost text-sm">
                Regenerate questions
              </button>
            </div>
          </div>
        </>
      )}

      {/* Stage 2: brief */}
      {brief && (
        <>
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${VERDICT_STYLE[brief.traction_read.verdict]}`}
              >
                {brief.traction_read.verdict}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-muted">Traction read</span>
            </div>
            <p className="text-sm text-fg/90">{brief.traction_read.summary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-ok">Working</div>
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {brief.traction_read.whats_working.map((w, i) => (
                    <li key={i}>· {w}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium text-bad">Not working</div>
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {brief.traction_read.whats_not.map((w, i) => (
                    <li key={i}>· {w}</li>
                  ))}
                </ul>
              </div>
            </div>
            {brief.traction_read.data_gaps.length > 0 && (
              <div className="text-xs text-muted">
                <span className="text-warn/80">Can't tell yet:</span>{" "}
                {brief.traction_read.data_gaps.join(" · ")}
              </div>
            )}
          </div>

          <div className="card p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Next moves — tap to pick 1-3 for the next cycle
            </div>
            {brief.next_moves.map((m) => {
              const selected = selectedFocus.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleFocus(m.id)}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                    selected ? "border-accent bg-accent/10" : "border-fg/10 hover:border-fg/25"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`flex-none w-4 h-4 rounded-full border text-[10px] flex items-center justify-center ${
                        selected ? "border-accent bg-accent text-white" : "border-fg/25 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-sm font-medium text-fg">{m.title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${MOVE_BADGE[m.type]}`}>
                      {m.type}
                    </span>
                    <span className="rounded bg-fg/10 px-1.5 py-0.5 text-[10px] text-muted">{m.effort}</span>
                  </div>
                  <div className="mt-1 pl-6 text-xs text-muted">{m.why}</div>
                  <div className="mt-0.5 pl-6 text-xs text-accent/80">Expected: {m.expected_impact}</div>
                </button>
              );
            })}
          </div>

          {/* Stage 3: decision gate */}
          <div className="card p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Your call</div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => decide("next-cycle", { focusIds: selectedFocus })}
                disabled={busy || selectedFocus.length === 0}
                className="btn-primary text-sm"
              >
                {busy ? "Starting…" : `Start cycle ${cycle + 1} →`}
              </button>
              <button onClick={() => decide("keep-collecting")} disabled={busy} className="btn-ghost text-sm">
                Keep collecting data
              </button>
              <button
                onClick={() => setConfirmArchive((c) => !c)}
                disabled={busy}
                className="btn-ghost text-sm text-bad"
              >
                Cancel &amp; archive
              </button>
            </div>
            {selectedFocus.length === 0 && (
              <p className="text-xs text-muted">Pick at least one next move to start a new cycle.</p>
            )}
            {state?.lastDecision === "keep-collecting" && (
              <p className="text-xs text-warn/80">
                Holding — the ops checklist and posting loop keep running. Re-run the check-in when
                there's more data.
              </p>
            )}
            {confirmArchive && (
              <div className="space-y-2 rounded-lg border border-bad/30 bg-bad/5 p-3">
                <p className="text-xs text-muted">
                  Archiving stops the pipeline for this project. Nothing is deleted and you can
                  unarchive any time. <span className="text-bad">Your deployed app stays live on
                  your hosting</span> — shut it down in the AWS console if you want it offline.
                </p>
                <input
                  className="input w-full text-sm"
                  placeholder="Why are you stopping? (saved as a learning, optional)"
                  value={archiveNote}
                  onChange={(e) => setArchiveNote(e.target.value)}
                />
                <button
                  onClick={() => decide("archive", { note: archiveNote })}
                  disabled={busy}
                  className="rounded bg-bad/20 px-3 py-1.5 text-sm text-bad hover:bg-bad/30"
                >
                  {busy ? "Archiving…" : "Yes — archive this project"}
                </button>
              </div>
            )}
          </div>

          <div className="card p-4">
            <button onClick={synthesize} disabled={busy} className="btn-ghost text-sm">
              {busy ? "Re-analyzing…" : "Re-run analysis with updated answers"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
