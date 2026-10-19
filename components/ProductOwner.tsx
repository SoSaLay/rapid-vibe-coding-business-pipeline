"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useRef, useState } from "react";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";
import { Doc, DocSection, DocP, DocMuted, DocFacts, DocChips, firstSentence } from "./doc/Doc";

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
  initialDialogue,
  spec,
  mode = "doc",
  artifact,
  stageName = "Define the Problem",
  autostart = false,
  onUpdated,
}: {
  /** Start the questions on arrival (new agent / "Start" button from the previous page). */
  autostart?: boolean;
  projectId: string;
  /** This stage's display name — "Define the Problem" (project) or "Define the Job" (agent). */
  stageName?: string;
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
  const stopper = useStopper();
  const started = useRef(false);
  const isAgent = stageName === "Define the Job";

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => {
        const claude = d.providers?.find((p: any) => p.id === "ai-anthropic");
        setAiReady(!!claude?.configured);
      })
      .catch(() => setAiReady(false));
  }, []);

  // Arriving from "New agent" (or the previous stage's Start button): begin the questions right away.
  useEffect(() => {
    if (autostart && aiReady && !dialogue && !spec && !started.current) {
      started.current = true;
      startReview();
    }
  }, [autostart, aiReady, dialogue, spec]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Questions done: write it up straight away, no extra click.
      if (d.dialogue?.ready) await synthesize();
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

  // Spec already produced — show it (editable).
  if (spec) return <SpecView spec={spec} projectId={projectId} onUpdated={onUpdated} />;

  if (aiReady === false) {
    return (
      <div className="card p-5 space-y-3">
        <h3 className="text-fg font-medium">Connect Claude</h3>
        <p className="text-xs text-muted">
          {stageName} uses Claude to interrogate and structure your idea. Paste your Anthropic API key
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

  const lastPo = dialogue ? dialogue.turns.map((t) => t.role).lastIndexOf("po") : -1;
  const openQuestions = dialogue && !dialogue.ready ? dialogue.turns[lastPo]?.questions ?? [] : [];
  const followUp = lastPo > 0;

  return (
    <div className="space-y-6">
      {!dialogue && !busy && <StageStart label={isAgent ? "Start agent building" : "Start"} locked={aiReady === null ? "Checking your AI engine…" : null} onStart={startReview} />}

      {busy && (
        <StageLoading
          text={dialogue?.ready || (dialogue && openQuestions.length === 0) ? "Writing it up…" : dialogue ? "Reading your answers…" : "Reading your idea…"}
          onStop={stopper.stop}
        />
      )}

      {!busy && openQuestions.length > 0 && (
        <>
          {followUp && <p className="text-sm text-muted">A couple of quick follow-ups.</p>}
          <Questionnaire questions={openQuestions} busy={busy} onSubmit={submitAnswer} onSkip={synthesize} />
        </>
      )}

      {!busy && dialogue?.ready && (
        <div className="py-4 text-center">
          <button className="btn-primary" onClick={synthesize}>Write it up →</button>
        </div>
      )}

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
}: {
  questions: POQuestion[];
  busy: boolean;
  onSubmit: (text: string) => void;
  onSkip: () => void;
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
  const letter = (i: number) => String.fromCharCode(65 + i);

  return (
    <div className="space-y-8">
      {questions.map((q, qi) => {
        const opts = q.options ?? [];
        const isOther = choice[q.id] === OTHER || !opts.length;
        const row = (key: string, label: React.ReactNode, i: number, on: boolean, pick: () => void) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={pick}
            className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-[15px] transition-colors ${
              on ? "border-accent bg-accent/10 text-fg" : "border-edge text-fg/90 hover:border-accent/50"
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${on ? "bg-accent text-white" : "bg-edge text-muted"}`}>
              {letter(i)}
            </span>
            <span className="pt-0.5">{label}</span>
          </button>
        );
        return (
          <div key={q.id}>
            <div className="mb-3 text-[17px] font-semibold leading-snug text-fg">
              {qi + 1}. {q.question}
            </div>
            <div className="space-y-2">
              {opts.map((opt, i) => row(opt, opt, i, choice[q.id] === opt, () => setChoice((c) => ({ ...c, [q.id]: opt }))))}
              {opts.length > 0 && row(OTHER, "Something else…", opts.length, choice[q.id] === OTHER, () => setChoice((c) => ({ ...c, [q.id]: OTHER })))}
            </div>
            {isOther && (
              <input
                className="input mt-2 text-sm"
                placeholder="Type your answer…"
                value={other[q.id] || ""}
                disabled={busy}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5">
        <button className="btn-ghost" disabled={busy} onClick={onSkip}>
          Skip &amp; generate spec
        </button>
        <button className="btn-primary px-5" disabled={busy || answeredCount === 0} onClick={submit}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function SpecView({ spec, projectId, onUpdated }: { spec: Record<string, any>; projectId: string; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <SpecEditor spec={spec} projectId={projectId} onDone={() => { setEditing(false); onUpdated(); }} onCancel={() => setEditing(false)} />;

  // The one-sentence elevator answer. Older specs fall back to the value prop.
  const problemSolved = firstSentence(spec.problem_solved || spec.value_proposition || "");
  const whatChanges = firstSentence(spec.value_proposition);
  const list = (v: any): string[] => (Array.isArray(v) ? v : []);
  const mustHaves: any[] = Array.isArray(spec.must_have_features) ? spec.must_have_features : [];
  const editButton = (
    <button className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent/85" onClick={() => setEditing(true)}>
      ✎ Edit
    </button>
  );

  return (
    <Doc>
      <div className="mb-2 flex justify-end">{editButton}</div>
      <DocSection title="The problem">
        {problemSolved && <DocP className="text-[1.35rem] font-medium leading-relaxed text-fg">{problemSolved}</DocP>}
        <DocFacts
          items={[
            { label: "Who it's for", value: list(spec.target_users)[0] },
            // Older specs reuse the value prop as the pitch above — don't say it twice.
            { label: "What changes", value: whatChanges === problemSolved ? "" : whatChanges },
          ]}
        />
      </DocSection>

      {spec.agent ? (
        <AgentJobSections agent={spec.agent} />
      ) : (
        <DocSection title="What we're building">
          <ul className="doc-p space-y-2">
            {mustHaves.map((f, i) => (
              <li key={i}>
                <details>
                  <summary className="cursor-pointer font-medium text-fg">{f.name}</summary>
                  <DocMuted className="mt-1">{f.description}</DocMuted>
                </details>
              </li>
            ))}
          </ul>
          <DocFacts items={[{ label: "Not building", value: list(spec.non_goals).slice(0, 3).join(" · ") }]} />
          <div className="mt-4">
            <DocChips items={list(spec.success_metrics).slice(0, 2)} />
          </div>
        </DocSection>
      )}
    </Doc>
  );
}

const SENSITIVITY: Record<string, string> = { public: "Public", internal: "Internal", pii: "Personal data (PII)", regulated: "Regulated" };

/** Agent pipeline: the job, who does what, and the boundaries. Short and scannable. */
function AgentJobSections({ agent }: { agent: Record<string, any> }) {
  const list = (v: any): string[] => (Array.isArray(v) ? v : []);
  const bullets = (items: string[]) => (
    <ul className="doc-p list-disc space-y-1 pl-5">
      {items.map((x) => <li key={x}>{x}</li>)}
    </ul>
  );
  return (
    <>
      <DocSection title="What the AI does">
        {bullets(list(agent.allowed_actions))}
        {list(agent.forbidden_actions).length > 0 && (
          <>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Never does</div>
            {bullets(list(agent.forbidden_actions))}
          </>
        )}
      </DocSection>

      <DocSection title="What you do">
        <DocP>{agent.human_fallback || "Review its work when it hands something off."}</DocP>
      </DocSection>

      <DocSection title="Boundaries">
        <DocFacts
          items={[
            { label: "How often it runs", value: agent.trigger },
            { label: "Speed", value: agent.latency_budget },
            { label: "Cost", value: agent.cost_budget },
            { label: "Data", value: SENSITIVITY[agent.data_sensitivity] ?? agent.data_sensitivity },
          ]}
        />
      </DocSection>
    </>
  );
}

/** A text box that always shows all of its text: it grows with the content instead of scrolling. */
function AutoTextarea({ value, onChange, minRows = 1 }: { value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} className="input mt-1 w-full resize-none overflow-hidden text-sm leading-relaxed" rows={minRows} value={value} onChange={onChange} />;
}

/** Edit what the PO wrote before moving on. Saving makes a new spec version that the next stage reads. */
function SpecEditor({ spec, projectId, onDone, onCancel }: { spec: Record<string, any>; projectId: string; onDone: () => void; onCancel: () => void }) {
  const a = spec.agent ?? {};
  const lines = (v: any) => (Array.isArray(v) ? v.join("\n") : "");
  const [f, setF] = useState<Record<string, string>>({
    problem_solved: spec.problem_solved ?? "",
    who: (spec.target_users ?? [])[0] ?? "",
    value_proposition: spec.value_proposition ?? "",
    task: a.task ?? "",
    trigger: a.trigger ?? "",
    success_criteria: lines(a.success_criteria),
    failure_criteria: lines(a.failure_criteria),
    allowed_actions: lines(a.allowed_actions),
    forbidden_actions: lines(a.forbidden_actions),
    human_fallback: a.human_fallback ?? "",
    latency_budget: a.latency_budget ?? "",
    cost_budget: a.cost_budget ?? "",
    data_sensitivity: a.data_sensitivity ?? "internal",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const split = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    setError(null);
    const next: Record<string, any> = {
      ...spec,
      problem_solved: f.problem_solved,
      value_proposition: f.value_proposition,
      target_users: [f.who, ...(spec.target_users ?? []).slice(1)].filter(Boolean),
    };
    if (spec.agent) {
      next.agent = {
        ...a,
        task: f.task,
        trigger: f.trigger,
        success_criteria: split(f.success_criteria),
        failure_criteria: split(f.failure_criteria),
        allowed_actions: split(f.allowed_actions),
        forbidden_actions: split(f.forbidden_actions),
        human_fallback: f.human_fallback,
        latency_budget: f.latency_budget,
        cost_budget: f.cost_budget,
        data_sensitivity: f.data_sensitivity,
      };
    }
    const res = await fetch(`/api/projects/${projectId}/product-owner/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: next }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error || "Couldn't save.");
    onDone();
  }

  const field = (label: string, k: string, rows = 1, hint?: string) => (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      <AutoTextarea value={f[k]} onChange={set(k)} minRows={rows} />
    </label>
  );

  return (
    <div className="space-y-4">
      {field("The problem, in one line", "problem_solved")}
      {field("Who it's for", "who")}
      {field("What changes", "value_proposition", 2)}
      {spec.agent && (
        <>
          {field("What the AI does", "allowed_actions", 4, "one per line")}
          {field("Never does", "forbidden_actions", 3, "one per line")}
          {field("What you do", "human_fallback", 2)}
          {field("How often it runs", "trigger", 1, "e.g. every Monday, or about 40 times a day")}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Speed", "latency_budget")}
            {field("Cost", "cost_budget")}
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Data</span>
              <select className="input mt-1 w-full text-sm" value={f.data_sensitivity} onChange={set("data_sensitivity")}>
                {Object.entries(SENSITIVITY).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
