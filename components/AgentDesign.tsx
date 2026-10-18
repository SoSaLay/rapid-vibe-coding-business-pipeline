"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentDesign as Design, Choice, ToolContract, SkillDef } from "@/lib/agent/design";
import { designBlockers, MODEL_PROVIDERS, modelProvider, effectiveMemory, effectiveLimits, defaultToolLimit, stopRules } from "@/lib/agent/design";
import type { MemoryConfig, McpServer } from "@/lib/agent/design";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";

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
  spec,
  autostart = false,
  onUpdated,
}: {
  autostart?: boolean;
  projectId: string;
  hasSpec: boolean;
  state: { design?: Design; approved?: boolean } | null;
  spec?: Record<string, any> | null;
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

  // Arriving from "Start Agent Design": recommend the design right away.
  const auto = useRef(false);
  useEffect(() => {
    if (autostart && hasSpec && !state?.design && !auto.current) {
      auto.current = true;
      propose();
    }
  }, [autostart, hasSpec, state?.design]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Skills / knowledge changes go through their own routes; unsaved edits are saved first so nothing is lost. */
  async function designAction(path: "skills" | "knowledge", body: any, label: string): Promise<boolean> {
    setBusy(label);
    if (dirty && design && !(await call("save", { design }))) {
      setBusy(null);
      return false;
    }
    const d = await call(path, body);
    setBusy(null);
    if (d) {
      setDirty(false);
      onUpdated();
    }
    return !!d;
  }

  function edit(patch: Partial<Design>) {
    if (!design) return;
    setDesign({ ...design, ...patch });
    setDirty(true);
  }

  if (!hasSpec) return <StageStart label="Start Agent Design" locked="Finish Define the Job first." onStart={() => {}} />;

  if (!design) {
    return (
      <StageStart
        label="Start Agent Design"
        busy={busy}
        error={error}
        onStart={propose}
        onStop={() => { stopper.stop(); setBusy(null); }}
      />
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
        <ChoicePicker choice={design.model} onPick={(id) => edit({ model: { ...design.model, selected: id }, model_endpoint: undefined, model_price: undefined })} />
        <CustomModel design={design} onChange={edit} />
      </DocSection>

      <DocSection title="Tools">
        <div className="space-y-2">
          {design.tools.map((t, i) => (
            <ToolCard
              key={t.name + i}
              tool={t}
              onChange={(next) => edit({ tools: design.tools.map((x, j) => (j === i ? next : x)) })}
            />
          ))}
        </div>
        <AddTool onAdd={(t) => edit({ tools: [...design.tools, t] })} existing={design.tools.map((t) => t.name)} />
      </DocSection>

      <DocSection title="MCP servers">
        <DocMuted>
          Plug in ready-made tools from any MCP server (e.g. Notion, GitHub, a database). The agent loads its tools when it starts, with
          the same limits as its own tools. Leave &quot;Ask me first&quot; on unless you trust every tool the server offers.
        </DocMuted>
        <McpEditor servers={design.mcp_servers ?? []} onChange={(mcp_servers) => edit({ mcp_servers })} />
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

      <DocSection title="Skills">
        <DocMuted>
          Skills are step-by-step playbooks the agent opens only when a task needs them, so they don&apos;t crowd its attention. Add new
          ones any time instead of building a new agent.
        </DocMuted>
        <SkillsEditor design={design} run={designAction} busy={!!busy} />
      </DocSection>

      <DocSection title="Knowledge">
        <KnowledgeEditor design={design} run={designAction} busy={!!busy} />
      </DocSection>

      <DocSection title="Memory">
        <MemoryEditor
          value={effectiveMemory(design, spec?.agent)}
          sensitive={["pii", "regulated"].includes(spec?.agent?.data_sensitivity)}
          onChange={(m) =>
            edit({
              memory_config: m,
              memory: { ...design.memory, selected: m.user_profile.enabled || m.past_conversations.enabled ? "long-term" : m.conversation ? "conversation" : "none" },
            })
          }
        />
      </DocSection>

      <DocSection title="Safety">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="step-limit" className="text-fg">Stop after</label>
          <input
            id="step-limit"
            type="number"
            min={1}
            max={50}
            className="input w-20"
            value={design.step_limit}
            onChange={(e) => edit({ step_limit: Number(e.target.value) })}
          />
          <span className="text-fg">steps, then hand off to a person.</span>
        </div>
        {design.fallback && <p className="mt-2 text-sm text-muted">Hands off to: {design.fallback}</p>}
      </DocSection>

      <details className="doc-section">
        <summary className="cursor-pointer text-sm font-semibold text-fg">Limits &amp; stopping (advanced)</summary>
        <LimitsEditor design={design} spec={spec} onChange={edit} />
      </details>

      <DocSection title="Hosting & monthly cost">
        <CostEstimate projectId={projectId} refreshKey={design.model.selected + (design.login?.selected ?? "") + String(approved)} />
      </DocSection>

      <DocSection title="Credentials">
        <Credentials projectId={projectId} refreshKey={JSON.stringify(enabledTools.map((t) => t.credential_env)) + design.model.selected + String(approved)} />
      </DocSection>
    </Doc>
  );
}

/** Plain one-line notes per model (no $ signs). */
const MODEL_BULLETS: Record<string, string[]> = {
  "anthropic:claude-opus-5-5": ["Smartest, for hard multi-step work", "Costs the most and is slower"],
  "anthropic:claude-sonnet-5-5": ["Best fit for most agents", "Mid-priced and fast"],
  "anthropic:claude-haiku-5-5": ["Cheapest and fastest", "Best for simple, repetitive tasks"],
  "openai:gpt-5": ["OpenAI's general model", "Mid-priced and fast"],
  "openai:gpt-5-mini": ["Cheap and fast", "For simple tasks"],
};

function ChoicePicker({ choice, onPick }: { choice: Choice; onPick: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {choice.options.map((o) => {
        const on = choice.selected === o.id;
        const bullets = MODEL_BULLETS[o.id] ?? (o.tradeoff ? [o.tradeoff] : []);
        return (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
              on ? "border-accent/60 bg-accent/5" : "border-edge hover:border-accent/30"
            }`}
          >
            <input type="radio" className="mt-1" checked={on} onChange={() => onPick(o.id)} />
            <span className="min-w-0">
              <span className="font-medium text-fg">{o.label.split(" · ")[0]}</span>
              {o.id === choice.recommended && (
                <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Recommended</span>
              )}
              {bullets.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                  {bullets.slice(0, 2).map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** "read_email" → "Read email". */
function toolTitle(name: string) {
  const t = name.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ToolCard({ tool, onChange }: { tool: ToolContract; onChange: (t: ToolContract) => void }) {
  const bullets = [
    tool.side_effect === "write" ? "Changes things (sends, labels, posts…)" : "Only reads, never changes anything",
    tool.credential_label ? `Needs: ${tool.credential_label}` : "No login needed",
  ];
  return (
    <div className={`rounded-lg border border-edge p-3 text-sm ${tool.enabled ? "" : "opacity-50"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-fg">{toolTitle(tool.name)}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-fg">
          <input type="checkbox" checked={tool.requires_approval} onChange={(e) => onChange({ ...tool, requires_approval: e.target.checked })} />
          Ask me first
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg">
          <input type="checkbox" checked={tool.enabled} onChange={(e) => onChange({ ...tool, enabled: e.target.checked })} />
          On
        </label>
      </div>
      <p className="mt-1 text-muted">{tool.description}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
        {bullets.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </div>
  );
}

/** Add a tool the recommendation missed. Its code is written in Engineering (a new tool means a full build). */
function AddTool({ onAdd, existing }: { onAdd: (t: ToolContract) => void; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [what, setWhat] = useState("");
  const [needs, setNeeds] = useState("");
  const [changes, setChanges] = useState(false);
  const [login, setLogin] = useState("");
  if (!open) {
    return (
      <button className="btn-ghost mt-3 text-sm" onClick={() => setOpen(true)}>
        + Add a tool
      </button>
    );
  }
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const ok = id && what.trim() && !existing.includes(id);
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-edge p-3 text-sm">
      <input className="input h-9 w-full" placeholder="Name (e.g. Look up order)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input h-9 w-full" placeholder="What it does (e.g. Finds an order by its number in Shopify)" value={what} onChange={(e) => setWhat(e.target.value)} />
      <input className="input h-9 w-full" placeholder="What it needs, comma-separated (e.g. order number)" value={needs} onChange={(e) => setNeeds(e.target.value)} />
      <input className="input h-9 w-full" placeholder="Login it needs, if any (e.g. Shopify API key)" value={login} onChange={(e) => setLogin(e.target.value)} />
      <label className="flex items-center gap-2 text-fg">
        <input type="checkbox" checked={changes} onChange={(e) => setChanges(e.target.checked)} />
        It changes things (sends, writes, deletes, pays)
      </label>
      <div className="flex gap-2">
        <button
          className="btn-primary text-sm"
          disabled={!ok}
          onClick={() => {
            onAdd({
              name: id,
              description: what.trim(),
              kind: "custom",
              integration: "",
              side_effect: changes ? "write" : "read",
              permission: changes ? "write access needed for this job" : "read-only",
              requires_approval: changes,
              credential_env: login.trim() ? login.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") : "",
              credential_label: login.trim(),
              inputs: needs
                .split(",")
                .map((n) => n.trim())
                .filter(Boolean)
                .map((n) => ({ name: n.toLowerCase().replace(/[^a-z0-9]+/g, "_"), type: "string" as const, description: n, required: true })),
              output: "",
              enabled: true,
            });
            setOpen(false);
            setName(""); setWhat(""); setNeeds(""); setLogin(""); setChanges(false);
          }}
        >
          Add tool
        </button>
        <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {id && existing.includes(id) && <p className="text-xs text-bad">A tool with that name already exists.</p>}
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

/** Any provider:model LangChain supports, plus an optional OpenAI-compatible endpoint and prices for cost numbers. */
function CustomModel({ design, onChange }: { design: Design; onChange: (p: Partial<Design>) => void }) {
  const isCustom = !design.model.options.some((o) => o.id === design.model.selected);
  const [open, setOpen] = useState(isCustom);
  const provider = isCustom ? modelProvider(design.model.selected) : "openai";
  const name = isCustom ? design.model.selected.split(":").slice(1).join(":") : "";
  const set = (p: string, m: string) => onChange({ model: { ...design.model, selected: `${p}:${m}` } });

  if (!open) {
    return (
      <button className="mt-3 text-sm text-accent underline" onClick={() => setOpen(true)}>
        Use a different model…
      </button>
    );
  }
  return (
    <div className={`mt-3 space-y-2 rounded-lg border p-3 text-sm ${isCustom ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
      <div className="font-medium text-fg">Custom model {isCustom && <span className="text-[11px] text-accent">selected</span>}</div>
      <div className="flex flex-wrap gap-2">
        <select className="input h-9 w-56" value={provider} onChange={(e) => set(e.target.value, name || "model-name")}>
          {Object.entries(MODEL_PROVIDERS).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
        </select>
        <input className="input h-9 min-w-0 flex-1" placeholder="Model name, e.g. gemini-2.5-pro" value={name} onChange={(e) => set(provider, e.target.value.trim())} />
      </div>
      {provider === "openai" && (
        <input
          className="input h-9 w-full"
          placeholder="Custom endpoint (optional), e.g. https://my-host/v1 for any OpenAI-compatible model"
          value={design.model_endpoint ?? ""}
          onChange={(e) => onChange({ model_endpoint: e.target.value.trim() || undefined })}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Price per million tokens (optional, for cost numbers): $
        <input
          className="input h-8 w-20"
          placeholder="in"
          value={design.model_price?.input ?? ""}
          onChange={(e) => onChange({ model_price: { input: Number(e.target.value) || 0, output: design.model_price?.output ?? 0 } })}
        />
        in / $
        <input
          className="input h-8 w-20"
          placeholder="out"
          value={design.model_price?.output ?? ""}
          onChange={(e) => onChange({ model_price: { input: design.model_price?.input ?? 0, output: Number(e.target.value) || 0 } })}
        />
        out
      </div>
      <DocMuted>The key for this provider is asked for under Credentials below. Evaluations will show whether it does the job as well.</DocMuted>
    </div>
  );
}

type Run = (path: "skills" | "knowledge", body: any, label: string) => Promise<boolean>;

const SOURCE_LABEL: Record<SkillDef["source"], string> = { recommended: "recommended", written: "written for you", imported: "imported" };

function SkillsEditor({ design, run, busy }: { design: Design; run: Run; busy: boolean }) {
  const [request, setRequest] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ description: string; instructions: string }>({ description: "", instructions: "" });
  const skills = design.skills ?? [];

  return (
    <div className="mt-3 space-y-3">
      {skills.map((s) => (
        <div key={s.name} className={`rounded-lg border border-edge p-3 text-sm ${s.enabled ? "" : "opacity-50"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-semibold text-fg">{s.name}</code>
            <span className="text-[11px] text-muted">{SOURCE_LABEL[s.source]}</span>
            {s.review && !s.review.approved && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">needs your review</span>}
            <div className="ml-auto flex gap-3 text-xs">
              <button className="text-accent underline" onClick={() => { setOpen(open === s.name ? null : s.name); setDraft({ description: s.description, instructions: s.instructions }); }}>
                {open === s.name ? "Close" : "Open"}
              </button>
              <button className="text-accent underline" disabled={busy} onClick={() => run("skills", { action: "toggle", name: s.name }, "Saving…")}>{s.enabled ? "Turn off" : "Turn on"}</button>
              <button className="text-bad underline" disabled={busy} onClick={() => run("skills", { action: "remove", name: s.name }, "Removing…")}>Remove</button>
            </div>
          </div>
          <p className="mt-1 text-fg/90">{s.description}</p>
          {s.review && !s.review.approved && (
            <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2 text-xs">
              <div className="font-medium text-fg">Security review{s.source_url ? ` · from ${s.source_url}` : ""}</div>
              {s.review.flags.length ? (
                <ul className="mt-1 list-disc pl-4 text-warn">{s.review.flags.map((f) => <li key={f}>{f}</li>)}</ul>
              ) : (
                <p className="mt-1 text-muted">Nothing suspicious found. Read it anyway before approving.</p>
              )}
              <p className="mt-1 text-muted">Only the SKILL.md text is imported, never scripts. Open it and read it before approving.</p>
              <button className="btn-ghost mt-2 text-xs" disabled={busy} onClick={() => run("skills", { action: "approve-review", name: s.name }, "Saving…")}>I read it, approve</button>
            </div>
          )}
          {open === s.name && (
            <div className="mt-2 space-y-2">
              <input className="input h-9 w-full text-xs" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <textarea className="input w-full font-mono text-xs" rows={12} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => run("skills", { action: "edit", name: s.name, ...draft }, "Saving…").then((ok) => ok && setOpen(null))}>Save skill</button>
            </div>
          )}
        </div>
      ))}
      {skills.length === 0 && <DocMuted>No skills yet.</DocMuted>}

      <div className="rounded-lg border border-dashed border-edge p-3 text-sm">
        <div className="font-medium text-fg">Add a skill</div>
        <textarea
          className="input mt-2 w-full text-sm"
          rows={2}
          placeholder="Describe the job, e.g. 'Write replies in our friendly tone: first name, one apology max, link the help page.'"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        <button className="btn-ghost mt-2 text-sm" disabled={busy || !request.trim()} onClick={() => run("skills", { action: "write", request }, "Writing the skill…").then((ok) => ok && setRequest(""))}>
          Write it for me →
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input h-9 min-w-0 flex-1 text-sm" placeholder="Or import one: link to a SKILL.md on GitHub" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-ghost text-sm" disabled={busy || !url.trim()} onClick={() => run("skills", { action: "import", url }, "Importing and reviewing…").then((ok) => ok && setUrl(""))}>
            Import
          </button>
        </div>
        <DocMuted className="mt-1">Find skills in Anthropic&apos;s skills repo, on GitHub, or in community libraries. Imported skills are security-reviewed and need your sign-off.</DocMuted>
      </div>
    </div>
  );
}

const KNOWLEDGE_OPTIONS = [
  { id: "none", label: "None", note: "The model's own knowledge is enough." },
  { id: "skills", label: "Built into skills", note: "Small, stable facts (policies, tone, rules) written into the skills above. No extra setup." },
  { id: "rag", label: "Document search (RAG)", note: "Optional. The agent searches your documents or pages for answers. Needs an OpenAI key, used for search embeddings only." },
] as const;

function KnowledgeEditor({ design, run, busy }: { design: Design; run: Run; busy: boolean }) {
  const k = design.knowledge ?? { mode: design.retrieval?.enabled ? "rag" : "none", sources: [] };
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <DocMuted>Pick one way for the agent to know what it needs.</DocMuted>
      <div className="space-y-2">
        {KNOWLEDGE_OPTIONS.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${k.mode === o.id ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
            <input type="radio" className="mt-1" checked={k.mode === o.id} disabled={busy} onChange={() => run("knowledge", { mode: o.id }, "Saving…")} />
            <span>
              <span className="font-medium text-fg">{o.label}</span>
              <span className="block text-muted">{o.note}</span>
            </span>
          </label>
        ))}
      </div>
      {k.mode === "rag" && (
        <div className="rounded-lg border border-edge p-3 text-sm">
          <div className="font-medium text-fg">Documents to search</div>
          <ul className="mt-2 space-y-1">
            {k.sources.map((src) => (
              <li key={src.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-fg">{src.kind === "url" ? "🔗" : "📄"} {src.title}</span>
                <button className="text-xs text-bad underline" disabled={busy} onClick={() => run("knowledge", { remove: src.id }, "Removing…")}>Remove</button>
              </li>
            ))}
            {k.sources.length === 0 && <DocMuted>None yet.</DocMuted>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input h-9 min-w-0 flex-1" placeholder="Add a page: https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn-ghost" disabled={busy || !url.trim()} onClick={() => run("knowledge", { add: { url } }, "Adding…").then((ok) => ok && setUrl(""))}>Add link</button>
          </div>
          <input className="input mt-2 h-9 w-full" placeholder="Or paste text — title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input mt-1 w-full" rows={3} placeholder="Paste a policy, FAQ, or notes" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-ghost mt-1" disabled={busy || !text.trim()} onClick={() => run("knowledge", { add: { title, text } }, "Adding…").then((ok) => ok && (setText(""), setTitle("")))}>Add text</button>
          <DocMuted className="mt-2">Documents are split, indexed and bundled with the agent when Engineering builds it.</DocMuted>
        </div>
      )}
    </div>
  );
}

function MemoryEditor({ value, sensitive, onChange }: { value: MemoryConfig; sensitive: boolean; onChange: (m: MemoryConfig) => void }) {
  const [what, setWhat] = useState(value.user_profile.what.join(", "));
  const row = (checked: boolean, title: string, note: string, toggle: (v: boolean) => void, extra?: React.ReactNode) => (
    <div className={`rounded-lg border p-3 text-sm ${checked ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <span className="font-medium text-fg">{title}</span>
          <span className="block text-muted">{note}</span>
        </span>
      </label>
      {checked && extra && <div className="mt-2 pl-7">{extra}</div>}
    </div>
  );
  return (
    <div className="space-y-2">
      {row(value.conversation, "This conversation", "Follow-up messages continue where the last one left off. Recommended for anything people talk to.", (v) => onChange({ ...value, conversation: v }))}
      {row(
        value.user_profile.enabled,
        "Remember each user's profile",
        "The agent saves lasting facts about a person (e.g. preferences) and sees them next time. Off unless it clearly helps.",
        (v) => onChange({ ...value, user_profile: { ...value.user_profile, enabled: v } }),
        <div className="space-y-1">
          <input
            className="input h-8 w-full text-xs"
            placeholder="What it may remember, comma-separated (e.g. preferences, company, timezone)"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            onBlur={() => onChange({ ...value, user_profile: { ...value.user_profile, what: what.split(",").map((x) => x.trim()).filter(Boolean) } })}
          />
          {sensitive && <p className="text-xs text-warn">This agent handles personal data: keep the list short, and never include anything sensitive.</p>}
        </div>
      )}
      {row(
        value.past_conversations.enabled,
        "Remember past conversations",
        "At the start of a new conversation, the agent sees its last few exchanges with the same person.",
        (v) => onChange({ ...value, past_conversations: { ...value.past_conversations, enabled: v } }),
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Last
          <input type="number" min={1} max={50} className="input h-8 w-16" value={value.past_conversations.items} onChange={(e) => onChange({ ...value, past_conversations: { ...value.past_conversations, items: Number(e.target.value) || 5 } })} />
          conversations, from the past
          <input type="number" min={1} max={365} className="input h-8 w-16" value={value.past_conversations.days} onChange={(e) => onChange({ ...value, past_conversations: { ...value.past_conversations, days: Number(e.target.value) || 30 } })} />
          days
        </div>
      )}
      <DocMuted>Memory is stored in your agent&apos;s own database, per user. Evaluations test that it remembers what it should and forgets what it shouldn&apos;t.</DocMuted>
    </div>
  );
}

function LimitsEditor({ design, spec, onChange }: { design: Design; spec?: Record<string, any> | null; onChange: (p: Partial<Design>) => void }) {
  const limits = effectiveLimits(design);
  const set = (tool: string, field: "max_calls" | "retries" | "timeout_s", v: number) =>
    onChange({ tool_limits: { ...(design.tool_limits ?? {}), [tool]: { ...limits[tool], [field]: Math.max(0, v) } } });
  return (
    <div className="mt-3 space-y-4">
      <DocMuted>Pre-filled for you. Read tools may retry; write tools run at most twice and never retry, because a retried write could happen twice.</DocMuted>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 pr-3">Tool</th>
              <th className="py-1 pr-3">Max calls / run</th>
              <th className="py-1 pr-3">Retries</th>
              <th className="py-1">Timeout (s)</th>
            </tr>
          </thead>
          <tbody>
            {design.tools.filter((t) => t.enabled).map((t) => (
              <tr key={t.name} className="border-t border-edge">
                <td className="py-1.5 pr-3"><code className="text-fg">{t.name}</code> <span className="text-[11px] text-muted">{t.side_effect}</span></td>
                {(["max_calls", "retries", "timeout_s"] as const).map((f) => (
                  <td key={f} className="py-1.5 pr-3">
                    <input type="number" min={0} className="input h-8 w-20" value={limits[t.name][f]} onChange={(e) => set(t.name, f, Number(e.target.value))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="text-xs text-accent underline" onClick={() => onChange({ tool_limits: Object.fromEntries(design.tools.map((t) => [t.name, defaultToolLimit(t)])) })}>
        Reset to recommended
      </button>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">When it stops (from Define the Job)</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-fg/90">
          {stopRules(spec, design).map((r) => <li key={r}>{r}</li>)}
        </ul>
        <DocMuted className="mt-1">It also stops when it repeats the same call with the same inputs, and at the step limit above.</DocMuted>
      </div>
    </div>
  );
}

function McpEditor({ servers, onChange }: { servers: McpServer[]; onChange: (s: McpServer[]) => void }) {
  const blank: McpServer = { name: "", transport: "http", url: "", command: "", args: [], token_env: "", approval: true, allow: [] };
  const [draft, setDraft] = useState<McpServer>(blank);
  const [allow, setAllow] = useState("");
  const [args, setArgs] = useState("");
  const add = () => {
    const name = draft.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!name) return;
    onChange([
      ...servers.filter((s) => s.name !== name),
      {
        ...draft,
        name,
        token_env: draft.token_env.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
        args: args.split(" ").map((a) => a.trim()).filter(Boolean),
        allow: allow.split(",").map((a) => a.trim()).filter(Boolean),
      },
    ]);
    setDraft(blank);
    setAllow("");
    setArgs("");
  };
  return (
    <div className="mt-3 space-y-3 text-sm">
      {servers.map((s) => (
        <div key={s.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge p-3">
          <code className="font-semibold text-fg">{s.name}</code>
          <span className="truncate text-xs text-muted">{s.transport === "http" ? s.url : `${s.command} ${(s.args ?? []).join(" ")}`}</span>
          {s.allow.length > 0 && <span className="text-xs text-muted">· only {s.allow.join(", ")}</span>}
          <label className="ml-auto flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={s.approval} onChange={(e) => onChange(servers.map((x) => (x.name === s.name ? { ...x, approval: e.target.checked } : x)))} />
            Ask me first
          </label>
          <button className="text-xs text-bad underline" onClick={() => onChange(servers.filter((x) => x.name !== s.name))}>Remove</button>
        </div>
      ))}
      <div className="space-y-2 rounded-lg border border-dashed border-edge p-3">
        <div className="font-medium text-fg">Add an MCP server</div>
        <div className="flex flex-wrap gap-2">
          <input className="input h-9 w-36" placeholder="Name (e.g. notion)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="input h-9 w-40" value={draft.transport} onChange={(e) => setDraft({ ...draft, transport: e.target.value as McpServer["transport"] })}>
            <option value="http">Remote (URL)</option>
            <option value="stdio">Local (command)</option>
          </select>
          {draft.transport === "http" ? (
            <input className="input h-9 min-w-0 flex-1" placeholder="https://…/mcp" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          ) : (
            <>
              <input className="input h-9 w-32" placeholder="Command (e.g. npx)" value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} />
              <input className="input h-9 min-w-0 flex-1" placeholder="Arguments (e.g. -y @notionhq/notion-mcp-server)" value={args} onChange={(e) => setArgs(e.target.value)} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="input h-9 w-56" placeholder="Token env name (optional, e.g. NOTION_TOKEN)" value={draft.token_env} onChange={(e) => setDraft({ ...draft, token_env: e.target.value })} />
          <input className="input h-9 min-w-0 flex-1" placeholder="Only these tools (optional, comma-separated)" value={allow} onChange={(e) => setAllow(e.target.value)} />
          <button className="btn-ghost" disabled={!draft.name.trim() || (draft.transport === "http" ? !draft.url : !draft.command)} onClick={add}>Add</button>
        </div>
        <DocMuted>The token itself goes under Credentials below. Changing MCP servers is a light change: no code rewrite.</DocMuted>
      </div>
    </div>
  );
}
