"use client";

import { useEffect, useState } from "react";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";

interface POQuestion {
  id: string;
  question: string;
  rationale: string;
  options?: string[];
}
interface POTurn {
  role: "po" | "owner";
  assessment?: string;
  questions?: POQuestion[];
  text?: string;
}
interface FrameworkSelection {
  ids: string[];
  rationale: string;
}
interface PODialogue {
  turns: POTurn[];
  ready: boolean;
  round: number;
  frameworks?: FrameworkSelection;
}
interface FrameworkSummary {
  id: string;
  plugin: string;
  name: string;
  description: string;
}

export function ProductOwner({
  projectId,
  ideaText,
  initialDialogue,
  spec,
  onUpdated,
}: {
  projectId: string;
  ideaText: string;
  initialDialogue: PODialogue | null;
  spec: Record<string, any> | null;
  onUpdated: () => void;
}) {
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [dialogue, setDialogue] = useState<PODialogue | null>(initialDialogue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<FrameworkSummary[]>([]);
  const [editingFw, setEditingFw] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const stopper = useStopper();

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => {
        const claude = d.providers?.find((p: any) => p.id === "ai-anthropic");
        setAiReady(!!claude?.configured);
      })
      .catch(() => setAiReady(false));
    fetch("/api/frameworks")
      .then((r) => r.json())
      .then((d) => setCatalog(d.frameworks || []))
      .catch(() => {});
  }, []);

  async function saveFrameworks() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/product-owner/frameworks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: draftIds }),
    });
    const d = await res.json();
    setBusy(false);
    setEditingFw(false);
    if (res.ok && dialogue) setDialogue({ ...dialogue, frameworks: d.frameworks });
  }

  function nameFor(id: string) {
    return catalog.find((f) => f.id === id)?.name || id;
  }

  async function connectAi() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ai/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "ai-anthropic", credentials: { apiKey } }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) return setError(d.error || "Failed to connect.");
    setAiReady(true);
  }

  async function startReview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-owner/start`, { method: "POST", signal: stopper.signal() });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Failed to start review.");
      setDialogue(d.dialogue);
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Failed to start review.");
    }
  }

  async function submitAnswer(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-owner/answer`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(d.error || "Failed to send answer.");
        if (d.dialogue) setDialogue(d.dialogue);
        return;
      }
      setDialogue(d.dialogue);
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Failed to send answer.");
    }
  }

  async function synthesize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-owner/synthesize`, { method: "POST", signal: stopper.signal() });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Failed to synthesize spec.");
      onUpdated();
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Failed to synthesize spec.");
    }
  }

  // Spec already produced — show it.
  if (spec) return <SpecView spec={spec} />;

  if (aiReady === false) {
    return (
      <div className="card p-5 space-y-3">
        <h3 className="text-fg font-medium">Connect Claude</h3>
        <p className="text-xs text-muted">
          The Product Owner uses Claude to interrogate and structure your idea. Paste your Anthropic API key
          (from console.anthropic.com). It’s stored locally and never leaves your machine.
        </p>
        <input
          className="input"
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !apiKey} onClick={connectAi}>
          {busy ? "Connecting…" : "Connect Claude"}
        </button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-muted mb-1">The idea</div>
        <p className="text-sm text-fg/90 whitespace-pre-wrap">{ideaText}</p>
      </div>

      <Interject projectId={projectId} phase="product-owner" />

      {!dialogue && (
        <div className="card p-5 text-center">
          <div className="flex items-center justify-center gap-2">
            <button className="btn-primary" disabled={busy || aiReady === null} onClick={startReview}>
              {busy ? "Reviewing…" : "Start Product Owner review"}
            </button>
            {busy && <StopButton onStop={stopper.stop} />}
          </div>
        </div>
      )}

      {dialogue?.frameworks && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted">Playbooks the PO is applying</div>
            <button
              className="text-xs text-accent2 hover:text-fg"
              onClick={() => {
                setDraftIds(dialogue.frameworks?.ids ?? []);
                setEditingFw((v) => !v);
              }}
            >
              {editingFw ? "Cancel" : "Adjust"}
            </button>
          </div>

          {!editingFw && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {(dialogue.frameworks.ids.length ? dialogue.frameworks.ids : ["(none)"]).map((id) => (
                  <span key={id} className="rounded-full bg-edge px-3 py-1 text-xs text-fg/90">
                    {id === "(none)" ? "None" : nameFor(id)}
                  </span>
                ))}
              </div>
              {dialogue.frameworks.rationale && (
                <p className="mt-2 text-xs text-muted">{dialogue.frameworks.rationale}</p>
              )}
            </>
          )}

          {editingFw && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted">Changes apply to the remaining questions and the final spec.</p>
              <div className="max-h-56 overflow-auto rounded-lg border border-edge divide-y divide-edge">
                {catalog.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-edge/40">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={draftIds.includes(f.id)}
                      onChange={(e) =>
                        setDraftIds((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id)))
                      }
                    />
                    <span>
                      <span className="text-sm text-fg">{f.name}</span>
                      <span className="block text-xs text-muted">{f.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button className="btn-primary" disabled={busy} onClick={saveFrameworks}>
                {busy ? "Saving…" : "Save playbooks"}
              </button>
            </div>
          )}
        </div>
      )}

      {dialogue && (() => {
        // The most recent PO turn holds the currently-open questions. When the
        // dialogue isn't ready yet, those are answered interactively below — so
        // skip them in the transcript to avoid showing each question twice.
        const lastPoIndex = dialogue.turns.map((t) => t.role).lastIndexOf("po");
        const openQuestions = !dialogue.ready ? dialogue.turns[lastPoIndex]?.questions ?? [] : [];
        return (
        <div className="space-y-3">
          {dialogue.turns.map((turn, i) => (
            <div key={i}>
              {turn.role === "po" ? (
                <div className="card p-4 border-l-2 border-l-accent">
                  <div className="text-[11px] uppercase tracking-wider text-accent2 mb-2">Product Owner</div>
                  {turn.assessment && <p className="text-sm text-fg/90 mb-3">{turn.assessment}</p>}
                  {(turn.questions ?? []).length > 0 && !(i === lastPoIndex && !dialogue.ready) && (
                    <ul className="space-y-2">
                      {turn.questions!.map((q) => (
                        <li key={q.id} className="text-sm">
                          <span className="text-fg">• {q.question}</span>
                          <span className="block text-xs text-muted ml-3">{q.rationale}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-edge/40 p-3 ml-6">
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-1">You</div>
                  <p className="text-sm text-fg/90 whitespace-pre-wrap">{turn.text}</p>
                </div>
              )}
            </div>
          ))}

          {dialogue.ready ? (
            <div className="card p-5 text-center space-y-3 border border-ok/40">
              <p className="text-sm text-fg">
                The Product Owner has enough to write the spec.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button className="btn-primary" disabled={busy} onClick={synthesize}>
                  {busy ? "Synthesizing…" : "Generate product spec →"}
                </button>
                {busy && <StopButton onStop={stopper.stop} />}
              </div>
            </div>
          ) : (
            <Questionnaire
              questions={openQuestions}
              busy={busy}
              onSubmit={submitAnswer}
              onSkip={synthesize}
              onStop={stopper.stop}
            />
          )}
        </div>
        );
      })()}

      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/**
 * Per-question answer UI (#1). Each PO question shows its tap-able options plus an
 * always-present "Other" free-text box, so the owner answers in one click instead of
 * typing prose. Selections are assembled into a single Q/A transcript and sent to the
 * existing answer endpoint, keeping the backend contract unchanged.
 */
const OTHER = "__other__";

function Questionnaire({
  questions,
  busy,
  onSubmit,
  onSkip,
  onStop,
}: {
  questions: POQuestion[];
  busy: boolean;
  onSubmit: (text: string) => void;
  onSkip: () => void;
  onStop?: () => void;
}) {
  // choice[id] = a selected option string, or the OTHER sentinel; other[id] = the free text.
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  function answerFor(q: POQuestion): string {
    const c = choice[q.id];
    if (c === OTHER || !q.options?.length) return (other[q.id] || "").trim();
    return (c || "").trim();
  }

  const allAnswered = questions.length > 0 && questions.every((q) => answerFor(q).length > 0);

  function submit() {
    const text = questions.map((q) => `Q: ${q.question}\nA: ${answerFor(q)}`).join("\n\n");
    onSubmit(text);
    setChoice({});
    setOther({});
  }

  if (questions.length === 0) return null;

  return (
    <div className="card p-4 space-y-4">
      {questions.map((q) => {
        const isOther = choice[q.id] === OTHER || !q.options?.length;
        return (
          <div key={q.id} className="space-y-2">
            <div className="text-sm text-fg">{q.question}</div>
            <div className="flex flex-wrap gap-2">
              {(q.options ?? []).map((opt) => {
                const selected = choice[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={busy}
                    onClick={() => setChoice((c) => ({ ...c, [q.id]: opt }))}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      selected
                        ? "border-accent bg-accent/15 text-fg"
                        : "border-edge text-muted hover:border-accent/60 hover:text-fg"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
              {q.options?.length ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setChoice((c) => ({ ...c, [q.id]: OTHER }))}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    choice[q.id] === OTHER
                      ? "border-accent bg-accent/15 text-fg"
                      : "border-edge text-muted hover:border-accent/60 hover:text-fg"
                  }`}
                >
                  Other…
                </button>
              ) : null}
            </div>
            {isOther && (
              <input
                className="input text-sm"
                placeholder="Type your answer…"
                value={other[q.id] || ""}
                disabled={busy}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
              />
            )}
          </div>
        );
      })}

      <div className="flex justify-between pt-1">
        <button className="btn-ghost" disabled={busy} onClick={onSkip} title="Skip ahead and write the spec now">
          Skip &amp; generate spec
        </button>
        <div className="flex items-center gap-2">
          {busy && onStop && <StopButton onStop={onStop} />}
          <button className="btn-primary" disabled={busy || !allAnswered} onClick={submit}>
            {busy ? "Thinking…" : "Send answers →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecView({ spec }: { spec: Record<string, any> }) {
  const Feature = ({ items }: { items: any[] }) => (
    <ul className="space-y-1">
      {(items ?? []).map((f, i) => (
        <li key={i} className="text-sm">
          <span className="text-fg">{f.name}</span>
          <span className="block text-xs text-muted">{f.description}</span>
        </li>
      ))}
    </ul>
  );
  const List = ({ items }: { items: any[] }) => (
    <ul className="list-disc ml-5 space-y-0.5 text-sm text-fg/85">
      {(items ?? []).map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted mb-2">{title}</div>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5 border border-ok/40">
        <div className="text-[11px] uppercase tracking-wider text-ok mb-2">Product Spec — complete</div>
        <p className="text-sm text-fg/90">{spec.summary}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Problem">
          <p className="text-sm text-fg/85">{spec.problem_statement}</p>
        </Section>
        <Section title="Value proposition">
          <p className="text-sm text-fg/85">{spec.value_proposition}</p>
        </Section>
        <Section title="Target users">
          <List items={spec.target_users} />
        </Section>
        <Section title="Success metrics">
          <List items={spec.success_metrics} />
        </Section>
        <Section title="Goals">
          <List items={spec.goals} />
        </Section>
        <Section title="Non-goals">
          <List items={spec.non_goals} />
        </Section>
        <Section title="Must-have features">
          <Feature items={spec.must_have_features} />
        </Section>
        <Section title="Nice-to-have features">
          <Feature items={spec.nice_to_have_features} />
        </Section>
        <Section title="Key risks">
          <List items={spec.key_risks} />
        </Section>
        <Section title="Open questions">
          <List items={spec.open_questions} />
        </Section>
        <Section title="Monetization">
          <p className="text-sm text-fg/85">{spec.monetization}</p>
        </Section>
        <Section title="PO recommendation">
          <p className="text-sm text-fg/85">{spec.recommendation}</p>
        </Section>
      </div>
      {Array.isArray(spec.frameworks_applied) && spec.frameworks_applied.length > 0 && (
        <p className="text-xs text-muted">
          Playbooks applied: {spec.frameworks_applied.join(", ")} · via pm-skills
        </p>
      )}
    </div>
  );
}
