"use client";

import { useEffect, useState } from "react";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";
import { Doc, DocSection, DocP, DocSub, DocMuted, DocList, DocProse } from "./doc/Doc";

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
  mode = "doc",
  artifact,
  onUpdated,
}: {
  projectId: string;
  ideaText: string;
  initialDialogue: PODialogue | null;
  spec: Record<string, any> | null;
  mode?: "doc" | "artifacts";
  /** Selected artifact id (Product Owner has a single one: the spec document). */
  artifact?: string;
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

  // Artifact face — the exportable spec document.
  if (mode === "artifacts") return <SpecExport spec={spec} />;

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
 *
 * Questions are individually skippable: one question the owner can't answer used to
 * block the whole round. Blanks are sent as an explicit skip so the PO decides that
 * point itself and records it as an open question, rather than silently assuming.
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

  const answeredCount = questions.filter((q) => answerFor(q).length > 0).length;

  function submit() {
    const text = questions
      .map((q) => `Q: ${q.question}\nA: ${answerFor(q) || "(skipped — you decide, and note it as an open question)"}`)
      .join("\n\n");
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

      <div className="flex items-center justify-between gap-3 pt-1">
        <button className="btn-ghost" disabled={busy} onClick={onSkip} title="Skip ahead and write the spec now">
          Skip &amp; generate spec
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted sm:inline">Skip any you're unsure of — the PO decides those.</span>
          {busy && onStop && <StopButton onStop={onStop} />}
          <button className="btn-primary" disabled={busy || answeredCount === 0} onClick={submit}>
            {busy ? "Thinking…" : `Send answers →`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** First sentence of a blob (up to the first . ! or ?), trimmed. Keeps the
 *  "Problem solved" line to one breath even when the source is a paragraph. */
function firstSentence(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

function SpecView({ spec }: { spec: Record<string, any> }) {
  // Features are {name, description}; render name in body type with a muted detail line.
  const Features = ({ items }: { items: any[] }) =>
    (items ?? []).length ? (
      <div className="mt-3 space-y-3">
        {(items ?? []).map((f, i) => (
          <div key={i}>
            <p className="font-medium text-fg">{f.name}</p>
            <div className="mt-0.5">
              <DocProse text={f.description} tone="muted" />
            </div>
          </div>
        ))}
      </div>
    ) : null;

  // The one-sentence elevator answer to "what does your business do?". Newer
  // specs carry a purpose-built `problem_solved`; fall back to the value prop so
  // specs generated before this field existed still show something. Clamp to the
  // first sentence either way — an elevator pitch is one breath, not a paragraph.
  const problemSolved = firstSentence(spec.problem_solved || spec.value_proposition || "");

  return (
    <Doc>
      {/* ───────────── Problem solved — say it in one breath, in person ───────────── */}
      {problemSolved && (
        <DocSection title="Problem solved">
          <DocP className="text-[1.35rem] font-medium leading-relaxed text-fg">{problemSolved}</DocP>
          <DocMuted className="mt-3">The one sentence you’d say if someone asked what your business does.</DocMuted>
        </DocSection>
      )}

      {/* ───────────── Summary — the spec in one breath ───────────── */}
      <DocSection title="Summary">
        <span className="rounded-full bg-ok px-3 py-1 text-sm font-semibold text-onbright">Product spec — complete</span>
        <div className="mt-5">
          <DocProse text={spec.summary} tone="lede" />
        </div>
        {spec.recommendation && (
          <div className="mt-8">
            <DocSub>PO recommendation</DocSub>
            <div className="mt-1">
              <DocProse text={spec.recommendation} />
            </div>
          </div>
        )}
      </DocSection>

      {/* ───────────── Problem & users — who & why ───────────── */}
      <DocSection title="Problem & users">
        <div className="space-y-8">
          <div>
            <DocSub>Problem</DocSub>
            <div className="mt-1">
              <DocProse text={spec.problem_statement} />
            </div>
          </div>
          <div>
            <DocSub>Value proposition</DocSub>
            <div className="mt-1">
              <DocProse text={spec.value_proposition} />
            </div>
          </div>
          <div>
            <DocSub>Target users</DocSub>
            <div className="mt-1">
              <DocList items={spec.target_users} />
            </div>
          </div>
        </div>
      </DocSection>

      {/* ───────────── Scope & features — what we will (and won't) build ───────────── */}
      <DocSection title="Scope & features">
        <div className="space-y-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <DocSub>Goals</DocSub>
              <div className="mt-1">
                <DocList items={spec.goals} />
              </div>
            </div>
            <div>
              <DocSub>Non-goals</DocSub>
              <div className="mt-1">
                <DocList items={spec.non_goals} />
              </div>
            </div>
          </div>
          <div>
            <DocSub>Must-have features</DocSub>
            <Features items={spec.must_have_features} />
          </div>
          <div>
            <DocSub>Nice-to-have features</DocSub>
            <Features items={spec.nice_to_have_features} />
          </div>
          <div>
            <DocSub>Success metrics</DocSub>
            <div className="mt-1">
              <DocList items={spec.success_metrics} />
            </div>
          </div>
        </div>
      </DocSection>

      {/* ───────────── Risks & monetization — what could break, how it pays ───────────── */}
      <DocSection title="Risks & monetization">
        <div className="space-y-8">
          <div>
            <DocSub>Key risks</DocSub>
            <div className="mt-1">
              <DocList items={spec.key_risks} />
            </div>
          </div>
          <div>
            <DocSub>Open questions</DocSub>
            <div className="mt-1">
              <DocList items={spec.open_questions} />
            </div>
          </div>
          <div>
            <DocSub>Monetization</DocSub>
            <div className="mt-1">
              <DocProse text={spec.monetization} />
            </div>
          </div>
          {Array.isArray(spec.frameworks_applied) && spec.frameworks_applied.length > 0 && (
            <DocMuted>Playbooks applied: {spec.frameworks_applied.join(", ")} · via pm-skills</DocMuted>
          )}
        </div>
      </DocSection>
    </Doc>
  );
}

/** Artifact: the product spec packaged as an exportable Markdown document. */
function SpecExport({ spec }: { spec: Record<string, any> | null }) {
  const [copied, setCopied] = useState(false);

  if (!spec) {
    return (
      <div className="card p-6 text-sm text-muted">
        Finish the Product Owner review first — the spec document is generated from the completed spec.
      </div>
    );
  }

  const md = specToMarkdown(spec);

  async function copy() {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function download() {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-spec.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="doc">
      <h2 className="doc-h">Spec document</h2>
      <p className="doc-p">The completed product spec, packaged as a portable Markdown doc to hand to engineering, design, or a collaborator.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="btn-primary" onClick={copy}>{copied ? "Copied ✓" : "Copy Markdown"}</button>
        <button className="btn-ghost" onClick={download}>Download .md</button>
      </div>
      <pre className="mt-6 max-h-[28rem] overflow-auto rounded-lg border border-edge bg-ink p-4 text-[12px] leading-relaxed text-fg/80 whitespace-pre-wrap">
        {md}
      </pre>
    </div>
  );
}

/** Flatten the product-spec payload into a clean Markdown document. */
function specToMarkdown(s: Record<string, any>): string {
  const out: string[] = [];
  const h = (t: string) => out.push(`## ${t}`, "");
  const p = (t?: string) => (t ? out.push(t, "") : null);
  const bullets = (items?: any[]) => {
    (items ?? []).forEach((x) => out.push(typeof x === "string" ? `- ${x}` : `- **${x.name}** — ${x.description}`));
    out.push("");
  };

  out.push("# Product Spec", "");
  if (s.problem_solved) p(`**Problem solved:** ${s.problem_solved}`);
  p(s.summary);
  if (s.idea_type) p(`**Idea type:** ${s.idea_type}`);
  h("Problem"); p(s.problem_statement);
  h("Value proposition"); p(s.value_proposition);
  if (s.target_users?.length) { h("Target users"); bullets(s.target_users); }
  if (s.goals?.length) { h("Goals"); bullets(s.goals); }
  if (s.non_goals?.length) { h("Non-goals"); bullets(s.non_goals); }
  if (s.must_have_features?.length) { h("Must-have features"); bullets(s.must_have_features); }
  if (s.nice_to_have_features?.length) { h("Nice-to-have features"); bullets(s.nice_to_have_features); }
  if (s.success_metrics?.length) { h("Success metrics"); bullets(s.success_metrics); }
  if (s.key_risks?.length) { h("Key risks"); bullets(s.key_risks); }
  if (s.open_questions?.length) { h("Open questions"); bullets(s.open_questions); }
  h("Monetization"); p(s.monetization);
  h("PO recommendation"); p(s.recommendation);
  if (Array.isArray(s.frameworks_applied) && s.frameworks_applied.length) {
    p(`_Playbooks applied: ${s.frameworks_applied.join(", ")} · via pm-skills_`);
  }
  return out.join("\n").trim() + "\n";
}
