"use client";

import { useEffect, useState } from "react";
import type { AgentDesign as Design, Choice, ToolContract } from "@/lib/agent/design";
import { designBlockers, needsNoTool } from "@/lib/agent/design";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";

interface CredItem {
  env: string;
  label: string;
  tool: string;
  set: boolean;
  shared: boolean;
}

/**
 * Agent pipeline — stage 2. Every decision is shown as an editable
 * recommendation; Approve design locks it, and Engineering builds exactly that.
 */
export function AgentDesign({
  projectId,
  hasSpec,
  state,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  state: { design?: Design; approved?: boolean } | null;
  onUpdated: () => void;
}) {
  const [design, setDesign] = useState<Design | null>(state?.design ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const stopper = useStopper();
  const approved = !!state?.approved && !dirty;

  useEffect(() => {
    setDesign(state?.design ?? null);
    setDirty(false);
  }, [state?.design]);

  async function call(path: string, body?: any): Promise<any | null> {
    setError(null);
    setBlockers([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/agent-design/${path}`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Request failed.");
        setBlockers(d.blockers ?? []);
        return null;
      }
      return d;
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Request failed.");
      return null;
    }
  }

  async function propose() {
    setBusy("Designing your agent…");
    const d = await call("propose");
    setBusy(null);
    if (d) onUpdated();
  }

  async function approve() {
    if (!design) return;
    setBusy("Approving…");
    if (dirty && !(await call("save", { design }))) return setBusy(null);
    const d = await call("approve");
    setBusy(null);
    if (d) {
      setDirty(false);
      onUpdated();
    }
  }

  function edit(patch: Partial<Design>) {
    if (!design) return;
    setDesign({ ...design, ...patch });
    setDirty(true);
  }

  if (!hasSpec) return <div className="card p-6 text-sm text-muted">Locked until Define the Job is complete.</div>;

  if (!design) {
    return (
      <div className="card space-y-4 p-6">
        <p className="text-center text-sm text-muted">
          The architect reads your job definition and recommends a design: the model, the tools and their permissions, the data it
          needs, memory, and where you must approve its actions. You can change any of it before anything is built.
        </p>
        <Interject projectId={projectId} phase="agent-design" />
        <div className="flex items-center justify-center gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={propose}>
            {busy ?? "Recommend a design →"}
          </button>
          {busy && <StopButton onStop={() => { stopper.stop(); setBusy(null); }} />}
        </div>
        {error && <p className="text-center text-sm text-bad">{error}</p>}
      </div>
    );
  }

  const localBlockers = designBlockers(design);
  const enabledTools = design.tools.filter((t) => t.enabled);

  return (
    <Doc>
      <div className={`card mb-6 flex flex-wrap items-center gap-3 p-4 ${approved ? "border border-ok/30" : ""}`}>
        {approved ? (
          <>
            <span className="rounded-full bg-ok px-3 py-1 text-sm font-semibold text-onbright">design approved</span>
            <span className="text-xs text-muted">Engineering builds exactly this. Change anything below to reopen it.</span>
          </>
        ) : (
          <>
            <span className="text-sm text-fg">Review the recommendations, change anything, then approve.</span>
            <div className="ml-auto flex items-center gap-2">
              <button className="btn-ghost text-sm" disabled={!!busy} onClick={propose}>Start over</button>
              <button className="btn-primary" disabled={!!busy || localBlockers.length > 0} onClick={approve}>
                {busy ?? "Approve design →"}
              </button>
            </div>
          </>
        )}
        {(error || blockers.length > 0 || (!approved && localBlockers.length > 0)) && (
          <ul className="w-full list-disc pl-5 text-sm text-bad">
            {error && <li>{error}</li>}
            {(blockers.length ? blockers : localBlockers).map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
      </div>

      <DocSection title="Overview">
        <DocP>{design.summary}</DocP>
        <DocFacts
          items={[
            { label: "Est. cost per run", value: design.est_cost_per_run },
            { label: "Est. time per run", value: design.est_latency },
          ]}
        />
      </DocSection>

      <DocSection title="Approach">
        <ChoicePicker choice={design.approach} onPick={(id) => edit({ approach: { ...design.approach, selected: id as any } })} />
      </DocSection>

      <DocSection title="Model">
        <ChoicePicker choice={design.model} onPick={(id) => edit({ model: { ...design.model, selected: id } })} />
      </DocSection>

      <DocSection title="Tools">
        <DocMuted>Each tool gets the narrowest permission it needs. Turn off any you don't want; flag writes that need your approval.</DocMuted>
        <div className="mt-3 space-y-3">
          {design.tools.map((t, i) => (
            <ToolCard
              key={t.name + i}
              tool={t}
              onChange={(next) => edit({ tools: design.tools.map((x, j) => (j === i ? next : x)) })}
            />
          ))}
        </div>
      </DocSection>

      <DocSection title="Data sources">
        <ul className="doc-p space-y-2">
          {design.data_sources.map((d) => (
            <li key={d.name}>
              <span className="font-medium text-fg">{d.name}</span>{" "}
              <span className="text-xs text-muted">({d.kind} · {d.access})</span>
              <DocMuted>{d.why}</DocMuted>
            </li>
          ))}
          {design.data_sources.length === 0 && <DocMuted>None needed.</DocMuted>}
        </ul>
      </DocSection>

      {design.login && (
        <DocSection title="Who can use it">
          <ChoicePicker choice={design.login} onPick={(id) => edit({ login: { ...design.login!, selected: id as any } })} />
        </DocSection>
      )}

      <DocSection title="Memory & knowledge">
        <ChoicePicker choice={design.memory} onPick={(id) => edit({ memory: { ...design.memory, selected: id as any } })} />
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={design.retrieval.enabled}
            onChange={(e) => edit({ retrieval: { ...design.retrieval, enabled: e.target.checked } })}
          />
          <span>
            <span className="font-medium text-fg">Look things up in your documents (retrieval)</span>
            <DocMuted>{design.retrieval.rationale}</DocMuted>
          </span>
        </label>
      </DocSection>

      <DocSection title="Safety">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="step-limit" className="font-medium text-fg">Step limit</label>
          <input
            id="step-limit"
            type="number"
            min={1}
            max={50}
            className="input w-20"
            value={design.step_limit}
            onChange={(e) => edit({ step_limit: Number(e.target.value) })}
          />
          <span className="text-xs text-muted">Most model + tool turns per run before it stops and hands off.</span>
        </div>
        <DocFacts
          items={[
            { label: "Hands off to", value: design.fallback },
            { label: "Needs your approval", value: enabledTools.filter((t) => t.requires_approval).map((t) => t.name).join(" · ") || "Nothing" },
          ]}
        />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-fg">Every allowed action → the tool that does it</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {design.coverage.map((c) => {
              const none = needsNoTool(design, c.tool);
              const ok = none || enabledTools.some((t) => t.name === c.tool);
              return (
                <li key={c.action}>
                  <span className={ok ? "text-ok" : "text-bad"}>{ok ? "✓" : "✗"}</span> {c.action} →{" "}
                  {none ? <span className="text-muted">no tool needed</span> : <code>{c.tool}</code>}
                </li>
              );
            })}
          </ul>
        </details>
      </DocSection>

      <DocSection title="Inputs & outputs">
        <FieldTable title="It receives" fields={design.inputs} />
        <FieldTable title="It hands back" fields={design.outputs} />
      </DocSection>

      <DocSection title="Hosting & monthly cost">
        <CostEstimate projectId={projectId} refreshKey={design.model.selected + (design.login?.selected ?? "") + String(approved)} />
      </DocSection>

      <DocSection title="Credentials">
        <Credentials projectId={projectId} refreshKey={JSON.stringify(enabledTools.map((t) => t.credential_env)) + design.model.selected + String(approved)} />
      </DocSection>
    </Doc>
  );
}

function ChoicePicker({ choice, onPick }: { choice: Choice; onPick: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {choice.options.map((o) => (
        <label
          key={o.id}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
            choice.selected === o.id ? "border-accent/60 bg-accent/5" : "border-edge hover:border-accent/30"
          }`}
        >
          <input type="radio" className="mt-1" checked={choice.selected === o.id} onChange={() => onPick(o.id)} />
          <span className="min-w-0">
            <span className="font-medium text-fg">{o.label}</span>
            {o.id === choice.recommended && (
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Recommended</span>
            )}
            {o.tradeoff && <span className="block text-muted">{o.tradeoff}</span>}
            {o.id === choice.recommended && choice.rationale && <span className="mt-1 block text-xs text-fg/80">{choice.rationale}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function ToolCard({ tool, onChange }: { tool: ToolContract; onChange: (t: ToolContract) => void }) {
  return (
    <div className={`rounded-lg border border-edge p-3 text-sm ${tool.enabled ? "" : "opacity-50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-semibold text-fg">{tool.name}</code>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tool.side_effect === "write" ? "bg-warn/15 text-warn" : "bg-edge text-muted"}`}>
          {tool.side_effect === "write" ? "changes things" : "read only"}
        </span>
        <span className="text-[11px] text-muted">{tool.kind === "integration" ? tool.integration || "integration" : "custom code"}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={tool.enabled} onChange={(e) => onChange({ ...tool, enabled: e.target.checked })} />
          On
        </label>
      </div>
      <p className="mt-1 text-fg/90">{tool.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          Permission
          <input className="input h-7 w-48 text-xs" value={tool.permission} onChange={(e) => onChange({ ...tool, permission: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={tool.requires_approval} onChange={(e) => onChange({ ...tool, requires_approval: e.target.checked })} />
          Ask me before it runs
        </label>
        {tool.credential_label && <span>Needs: {tool.credential_label}</span>}
      </div>
    </div>
  );
}

function FieldTable({ title, fields }: { title: string; fields: Design["inputs"] }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
      <ul className="mt-1 space-y-1 text-sm">
        {fields.map((f) => (
          <li key={f.name}>
            <code className="text-fg">{f.name}</code> <span className="text-xs text-muted">{f.type}{f.required ? "" : " · optional"}</span> — {f.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Paste the keys the design's tools need. Values go to the server and are never shown again. */
function Credentials({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
  const [items, setItems] = useState<CredItem[]>([]);
  const [langsmith, setLangsmith] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const d = await fetch(`/api/projects/${projectId}/agent-design/credentials`).then((r) => r.json()).catch(() => null);
    if (d) {
      setItems(d.items ?? []);
      setLangsmith(!!d.langsmith);
    }
  }
  useEffect(() => { load(); }, [projectId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    const d = await fetch(`/api/projects/${projectId}/agent-design/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (d) {
      setItems(d.items ?? []);
      setValues({});
    }
  }

  return (
    <div className="space-y-3">
      <DocMuted>Stored only on this machine and handed to the agent when it runs. Save after approving if the tools changed.</DocMuted>
      {items.map((c) => (
        <div key={c.env} className="flex flex-wrap items-center gap-2 text-sm">
          <span className={c.set ? "text-ok" : "text-warn"}>{c.set ? "✓" : "•"}</span>
          <span className="min-w-[10rem] font-medium text-fg">{c.label}</span>
          <code className="text-xs text-muted">{c.env}</code>
          {c.shared && c.set ? (
            <span className="text-xs text-muted">Using your connected AI key</span>
          ) : (
            <input
              type="password"
              autoComplete="off"
              className="input h-8 min-w-0 flex-1 text-xs"
              placeholder={c.set ? "Saved — paste to replace" : "Paste key"}
              value={values[c.env] ?? ""}
              onChange={(e) => setValues({ ...values, [c.env]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button className="btn-ghost text-sm" disabled={saving || Object.values(values).every((v) => !v)} onClick={save}>
          {saving ? "Saving…" : "Save keys"}
        </button>
        <span className="text-xs text-muted">
          LangSmith tracing: {langsmith ? "connected" : "not connected (optional — add it in the toolbox to inspect runs)"}
        </span>
      </div>
    </div>
  );
}

interface CostResp {
  host: "agentcore" | "railway";
  db: "supabase" | "neon";
  estimate: {
    runs_per_month: number;
    cost_per_run: number | null;
    cost_per_run_source: "measured" | "estimated" | "unknown";
    lines: { item: string; monthly: number; note: string }[];
    total: number;
  };
}

const money = (n: number) => (n === 0 ? "$0" : n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 100 ? 2 : 0)}`);

/** Where it runs + what it costs per month. These choices never require rebuilding the agent. */
function CostEstimate({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
  const [data, setData] = useState<CostResp | null>(null);
  const [runs, setRuns] = useState<string>("");

  async function load(body?: Record<string, unknown>) {
    const d = await fetch(`/api/projects/${projectId}/agent-cost`, {
      method: body ? "POST" : "GET",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (d) {
      setData(d);
      setRuns(String(d.estimate.runs_per_month));
    }
  }
  useEffect(() => { load(); }, [projectId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <DocMuted>Loading the estimate…</DocMuted>;
  const e = data.estimate;
  const pick = (cls: boolean) => `rounded-lg border px-3 py-2 text-sm ${cls ? "border-accent/60 bg-accent/5 text-fg" : "border-edge text-muted hover:border-accent/30"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-sm font-medium text-fg">Agent host</span>
        <button className={pick(data.host === "agentcore")} onClick={() => load({ host: "agentcore" })}>Amazon Bedrock AgentCore <span className="text-[11px] text-accent">Recommended</span></button>
        <button className={pick(data.host === "railway")} onClick={() => load({ host: "railway" })}>Railway</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-sm font-medium text-fg">State database</span>
        <button className={pick(data.db === "supabase")} onClick={() => load({ db: "supabase" })}>Supabase <span className="text-[11px] text-accent">Recommended</span></button>
        <button className={pick(data.db === "neon")} onClick={() => load({ db: "neon" })}>Neon</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="runs" className="w-28 font-medium text-fg">Runs per month</label>
        <input
          id="runs"
          type="number"
          min={0}
          className="input h-9 w-32"
          value={runs}
          onChange={(ev) => setRuns(ev.target.value)}
          onBlur={() => Number(runs) !== e.runs_per_month && load({ runsPerMonth: Number(runs) })}
        />
      </div>

      <div className="rounded-lg border border-edge">
        {e.lines.map((l) => (
          <div key={l.item} className="flex items-start justify-between gap-4 border-b border-edge p-3 text-sm last:border-b-0">
            <div className="min-w-0">
              <div className="text-fg">{l.item}</div>
              <div className="text-xs text-muted">{l.note}</div>
            </div>
            <div className="shrink-0 font-medium text-fg">{money(l.monthly)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 bg-panel p-3">
          <span className="text-sm font-semibold text-fg">Estimated total per month</span>
          <span className="text-lg font-semibold text-fg">{money(e.total)}</span>
        </div>
      </div>
      <DocMuted>
        {e.cost_per_run_source === "measured"
          ? "Model cost uses the cost per run measured in Evaluations."
          : "Model cost is the design's estimate until Evaluations measures the real cost per run."}{" "}
        Plan prices are approximate; check each provider before you rely on them. Changing these never requires rebuilding the agent.
      </DocMuted>
    </div>
  );
}
