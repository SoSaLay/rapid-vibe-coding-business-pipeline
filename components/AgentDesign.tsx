"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AgentDesign as Design, Choice, ToolContract, SkillDef } from "@/lib/agent/design";
import { designBlockers, MODEL_PROVIDERS, modelProvider, effectiveMemory, effectiveLimits, defaultToolLimit, stopRules } from "@/lib/agent/design";
import type { MemoryConfig, McpServer, LoginId } from "@/lib/agent/design";
import { DocMuted } from "./doc/Doc";
import { sectionAnchor } from "@/lib/pipeline";
import { AgentBuilder } from "./AgentBuilder";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";

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
  builtVersion = null,
  approvedVersion = 0,
  onUpdated,
}: {
  autostart?: boolean;
  /** The design version the agent's code was built from (null = not built yet). */
  builtVersion?: number | null;
  /** The latest approved design version. */
  approvedVersion?: number;
  projectId: string;
  hasSpec: boolean;
  state: { design?: Design; approved?: boolean } | null;
  spec?: Record<string, any> | null;
  onUpdated: () => void;
}) {
  const [design, setDesign] = useState<Design | null>(state?.design ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const stopper = useStopper();
  const router = useRouter();
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

  // Older designs and imported/edited skills lack the plain one-liner: fill it once, quietly.
  const plainAsked = useRef("");
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const missing = (state?.design?.skills ?? []).filter((s) => !s.plain).map((s) => s.name).join(",");
    if (!missing || plainAsked.current === missing) return;
    plainAsked.current = missing;
    fetch(`/api/projects/${projectId}/agent-design/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plain" }),
    })
      .then((r) => r.ok && !dirtyRef.current && onUpdated())
      .catch(() => {});
  }, [state?.design]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Lock the design (saving any edits first), then open Engineering, which starts itself. */
  async function startEngineering() {
    if (!design) return;
    setBusy("Approving…");
    if (dirty && !(await call("save", { design }))) return setBusy(null);
    if (!approved && !(await call("approve"))) return setBusy(null);
    setDirty(false);
    router.push(`/project/${projectId}/engineering?autostart=1`);
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
      if (built) await confirmChanges(true);
    }
    return !!d;
  }

  /**
   * On a built agent, a finished edit is confirmed right away: saved, approved, and Engineering
   * starts building it in the background (then Deployment, if pushing is automatic).
   */
  async function confirmChanges(force = false) {
    if (!built || (!dirty && !force && state?.approved)) return;
    setBusy("Saving your change…");
    if (dirty && design && !(await call("save", { design }))) return setBusy(null);
    const d = await call("approve");
    setBusy(null);
    if (d) {
      setDirty(false);
      if (d.autoflow) setNotice("Saved. Engineering & Development is building your change now.");
      onUpdated();
    }
  }

  /** Before the Automatic Agent Builder works on the design, save unsaved edits so it sees them. */
  async function saveDraft(): Promise<boolean> {
    if (!dirty || !design) return true;
    return !!(await call("save", { design }));
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
  const built = builtVersion !== null;
  const enabledTools = design.tools.filter((t) => t.enabled);

  const memory = effectiveMemory(design, spec?.agent);
  const limits = effectiveLimits(design);
  const customLimits = enabledTools.some((t) => {
    const d = defaultToolLimit(t);
    const l = limits[t.name];
    return l && (l.max_calls !== d.max_calls || l.retries !== d.retries || l.timeout_s !== d.timeout_s);
  });
  const skills = design.skills ?? [];
  const knowledge = design.knowledge ?? { mode: design.retrieval?.enabled ? "rag" : "none", sources: [] };
  const mcp = design.mcp_servers ?? [];
  const on = (v: boolean) => (v ? "On" : "Off");

  return (
    <>
    <AgentBuilder
      projectId={projectId}
      mode="design"
      disabled={!!busy}
      beforeSend={saveDraft}
      onChanged={() => { setDirty(false); onUpdated(); if (built) confirmChanges(true); }}
    />
    <div className="space-y-4">
      {notice && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-fg">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
          <span className="flex-1">{notice}</span>
          <a className="text-accent underline" href={`/project/${projectId}/engineering`}>See progress</a>
        </div>
      )}
      <DoneContext.Provider value={() => confirmChanges()}>
    <div className="space-y-3">
        {design.login && (
          <PanelSection title="Who uses it" tone="ok" summary={<AccessSummary login={design.login.selected} />} editor={
            <AccessEditor login={design.login} onPick={(id) => edit({ login: { ...design.login!, selected: id } })} />
          } />
        )}

        <PanelSection title="Model" summary={
          <>
            <Row label="Model"><Picked choice={design.model} /></Row>
            <Row label="Cost per run">{design.est_cost_per_run}</Row>
            <Row label="Time per run">{design.est_latency}</Row>
          </>
        } editor={
          <>
            <ChoicePicker choice={design.model} onPick={(id) => edit({ model: { ...design.model, selected: id }, model_endpoint: undefined, model_price: undefined })} />
            <CustomModel design={design} onChange={edit} />
          </>
        } />

        <PanelSection title="Tools" summary={
          enabledTools.length ? (
            enabledTools.map((t) => (
              <Row key={t.name} label={toolTitle(t.name)}>
                <Bullets items={[firstSentence(t.description)]} />
              </Row>
            ))
          ) : (
            <Row label="Tools">None</Row>
          )
        } editor={
          <>
            <div className="space-y-2">
              {design.tools.map((t, i) => (
                <ToolCard key={t.name + i} tool={t} onChange={(next) => edit({ tools: design.tools.map((x, j) => (j === i ? next : x)) })} />
              ))}
            </div>
            <AddTool onAdd={(t) => edit({ tools: [...design.tools, t] })} existing={design.tools.map((t) => t.name)} />
          </>
        } />

        <PanelSection title="MCP servers" summary={
          mcp.length ? (
            mcp.map((s) => (
              <Row key={s.name} label={toolTitle(s.name)}>
                <Bullets items={[s.transport === "http" ? "Remote" : "Local", s.approval ? "Asks you first" : "Runs on its own", ...(s.allow.length ? [`Only ${s.allow.join(", ")}`] : [])]} />
              </Row>
            ))
          ) : (
            <Row label="Servers">None added</Row>
          )
        } editor={
          <>
            <DocMuted>
              Plug in ready-made tools from any MCP server (e.g. Notion, GitHub, a database). Leave &quot;Ask me first&quot; on unless you trust every tool it offers.
            </DocMuted>
            <McpEditor servers={mcp} onChange={(mcp_servers) => edit({ mcp_servers })} />
          </>
        } />

        <PanelSection title="Data sources" summary={
          design.data_sources.length ? (
            design.data_sources.map((d) => (
              <Row key={d.name} label={d.name}>
                <Bullets items={[firstSentence(d.why)]} />
              </Row>
            ))
          ) : (
            <Row label="Sources">None needed</Row>
          )
        } />

        <PanelSection title="Skills" summary={
          skills.length ? (
            skills.map((s) => (
              <Row key={s.name} label={toolTitle(s.name)}>
                <span className={s.enabled ? "" : "text-muted"}>{s.enabled ? s.plain ?? firstSentence(s.description) : "Off"}</span>
                {s.review && !s.review.approved && <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">needs your review</span>}
              </Row>
            ))
          ) : (
            <Row label="Skills">None yet</Row>
          )
        } editor={
          <>
            <DocMuted>Step-by-step playbooks the agent opens only when a task needs them. Add new ones any time instead of building a new agent.</DocMuted>
            <SkillsEditor design={design} run={designAction} busy={!!busy} />
          </>
        } />

        <PanelSection title="Knowledge" summary={
          <>
            <Row label="Agent's knowledge">
              {skills.some((x) => x.enabled) ? "Already part of the agent, through its skills" : skills.length ? "Off (skills turned off)" : "The model's own knowledge"}
            </Row>
            <Row label="Document search">
              {knowledge.mode === "rag" ? `On · ${knowledge.sources.length || "no"} document${knowledge.sources.length === 1 ? "" : "s"}` : "Off"}
            </Row>
          </>
        } editor={<KnowledgeEditor design={design} run={designAction} busy={!!busy} />} />

        <PanelSection title="Memory" summary={
          <>
            <Row label="This conversation">{on(memory.conversation)}</Row>
            <Row label="User profile">
              {on(memory.user_profile.enabled)}
              {memory.user_profile.enabled && memory.user_profile.what.length > 0 && <Bullets items={[memory.user_profile.what.join(", ")]} />}
            </Row>
            <Row label="Past conversations">
              {memory.past_conversations.enabled ? `Last ${memory.past_conversations.items}, past ${memory.past_conversations.days} days` : "Off"}
            </Row>
          </>
        } editor={
          <MemoryEditor
            value={memory}
            sensitive={["pii", "regulated"].includes(spec?.agent?.data_sensitivity)}
            onChange={(m) =>
              edit({
                memory_config: m,
                memory: { ...design.memory, selected: m.user_profile.enabled || m.past_conversations.enabled ? "long-term" : m.conversation ? "conversation" : "none" },
              })
            }
          />
        } />

        <PanelSection title="Safety & limits" summary={
          <>
            <Row label="Step limit">{design.step_limit} steps, then a person takes over</Row>
            {design.fallback && <Row label="Hands off to">{design.fallback}</Row>}
            <Row label="Tool limits">{customLimits ? "Custom" : "Recommended"}</Row>
          </>
        } editor={
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label htmlFor="step-limit" className="text-fg">Stop after</label>
              <input id="step-limit" type="number" min={1} max={50} className="input w-20" value={design.step_limit} onChange={(e) => edit({ step_limit: Number(e.target.value) })} />
              <span className="text-fg">steps, then hand off to a person.</span>
            </div>
            <LimitsEditor design={design} spec={spec} onChange={edit} />
          </>
        } />

        <PanelSection title="Hosting & monthly cost" summary={
          <CostEstimate projectId={projectId} login={design.login?.selected} mode="summary" refreshKey={design.model.selected + (design.login?.selected ?? "") + String(approved)} />
        } editor={
          <CostEstimate projectId={projectId} login={design.login?.selected} mode="edit" refreshKey={design.model.selected + (design.login?.selected ?? "") + String(approved)} />
        } />
      </div>
    </DoneContext.Provider>

      <div className="mt-12 flex flex-col items-center gap-3 border-t border-edge pt-8">
        <div className="flex w-full max-w-xl flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
          <button
            className={`flex-1 rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-100 disabled:opacity-50 disabled:hover:scale-100`}
            disabled={!!busy || localBlockers.length > 0}
            onClick={startEngineering}
          >
            {busy ?? "Start Engineering & Development →"}
          </button>
        </div>
        {(error || blockers.length > 0 || localBlockers.length > 0) && (
          <ul className="w-full max-w-xl list-disc pl-5 text-sm text-bad">
            {error && <li>{error}</li>}
            {(blockers.length ? blockers : localBlockers).map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
      </div>

    </div>
    </>
  );
}

/** One settings block: title + Edit on the right, a short label/value summary, and the full options behind Edit. */
/** Called when an Edit is closed with Done: on a built agent that confirms the change. */
const DoneContext = createContext<() => void>(() => {});

function PanelSection({ title, summary, editor, editLabel = "Edit", tone }: { title: string; summary: ReactNode; editor?: ReactNode; editLabel?: string; tone?: "ok" }) {
  const onDone = useContext(DoneContext);
  const green = tone === "ok";
  const [editing, setEditing] = useState(false);
  return (
    <section id={sectionAnchor(title)} className={`scroll-mt-24 overflow-hidden rounded-xl border bg-ink/40 ${green ? "border-ok/40" : "border-edge"}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 ${green ? "border-ok/40 bg-ok/15" : "border-edge bg-panel"}`}>
        <h2 className={`text-lg font-semibold ${green ? "text-ok" : "text-fg"}`}>{title}</h2>
        {editor && (
          <button className={`text-sm font-medium hover:underline ${green ? "text-ok" : "text-accent"}`} onClick={() => { if (editing) onDone(); setEditing(!editing); }}>
            {editing ? "Done" : editLabel}
          </button>
        )}
      </div>
      <div className="px-4 py-4 sm:px-6">
        {editing ? <div className="space-y-3">{editor}</div> : <dl className="space-y-3">{summary}</dl>}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] gap-x-4 text-sm">
      <dt className="break-words font-medium text-fg">{label}</dt>
      <dd className="min-w-0 break-words text-fg/90">{children}</dd>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  const xs = items.filter(Boolean);
  if (!xs.length) return null;
  return (
    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-muted">
      {xs.map((b) => <li key={b}>{b}</li>)}
    </ul>
  );
}

/** The plain answers behind the login choice: do people use it, do they pay, and is there a chat page. */
function access(login: LoginId) {
  const people = login !== "machine-key";
  const paid = login === "clerk";
  return {
    people,
    paid,
    loginLabel: login === "clerk" ? "Clerk" : login === "neon-auth" ? "Neon Auth" : login === "supabase-auth" ? "Supabase Auth" : "None",
    chat: !people ? "None" : paid ? "Vercel Pro (~$20/month, needed to charge users)" : "Vercel Hobby (free)",
  };
}

function AccessSummary({ login }: { login: LoginId }) {
  const a = access(login);
  return (
    <>
      <Row label="People use it">
        {a.people ? "Yes, they chat with it" : "No, it runs on its own"}
        <Bullets items={[a.people ? "Each person sees only their own conversations" : "Called by your systems with a private key"]} />
      </Row>
      {a.people && <Row label="Free or paid">{a.paid ? "Paid" : "Free"}<Bullets items={[a.paid ? "Users pay through Clerk Billing" : "No payments"]} /></Row>}
      <Row label="Login">{a.people ? a.loginLabel : "None"}<Bullets items={[a.people ? (a.paid ? "Login and payments in one account" : "Comes with your state database") : "Private machine key only"]} /></Row>
      <Row label="Chat page">{a.people ? "Yes" : "None"}<Bullets items={[a.people ? `Hosted on ${a.chat}` : "No page to build or host"]} /></Row>
    </>
  );
}

function AccessEditor({ login, onPick }: { login: Choice<LoginId>; onPick: (id: LoginId) => void }) {
  const a = access(login.selected);
  const freeLogin: LoginId = login.selected === "neon-auth" ? "neon-auth" : "supabase-auth";
  const seg = (on: boolean) => `rounded-lg border px-3 py-2 text-sm ${on ? "border-accent/60 bg-accent/5 text-fg" : "border-edge text-muted hover:border-accent/30"}`;
  return (
    <div className="space-y-4">
      <div>
        <SubLabel>Do people use this agent?</SubLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={seg(a.people)} onClick={() => !a.people && onPick(freeLogin)}>Yes, people chat with it</button>
          <button className={seg(!a.people)} onClick={() => onPick("machine-key")}>No, it runs on its own</button>
        </div>
      </div>
      {a.people && (
        <>
          <div>
            <SubLabel>Is it free or paid for them?</SubLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={seg(!a.paid)} onClick={() => a.paid && onPick("supabase-auth")}>Free</button>
              <button className={seg(a.paid)} onClick={() => onPick("clerk")}>Paid</button>
            </div>
          </div>
          {!a.paid && (
            <div>
              <SubLabel>Login</SubLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={seg(login.selected === "supabase-auth")} onClick={() => onPick("supabase-auth")}>Supabase Auth</button>
                <button className={seg(login.selected === "neon-auth")} onClick={() => onPick("neon-auth")}>Neon Auth</button>
              </div>
              <DocMuted className="mt-1">Match your state database under Hosting.</DocMuted>
            </div>
          )}
          <DocMuted>People get a chat page on {a.chat}. Everyone logs in and sees only their own conversations.</DocMuted>
        </>
      )}
      {login.selected !== login.recommended && (
        <button className="text-xs text-accent underline" onClick={() => onPick(login.recommended)}>Back to recommended</button>
      )}
    </div>
  );
}

/** Keep summaries to one short line. */
function firstSentence(text: string) {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted first:pt-0">{children}</div>;
}

function optionLabel(choice: Choice) {
  const o = choice.options.find((x) => x.id === choice.selected);
  return (o?.label ?? choice.selected.split(":").slice(1).join(":") ?? choice.selected).split(" · ")[0];
}

/** The selected option with its 1–2 short notes underneath. */
function Picked({ choice }: { choice: Choice }) {
  const o = choice.options.find((x) => x.id === choice.selected);
  const bullets = MODEL_BULLETS[choice.selected] ?? (o?.tradeoff ? [o.tradeoff] : ["Custom"]);
  return (
    <>
      <span>{optionLabel(choice)}</span>
      {choice.selected === choice.recommended && (
        <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Recommended</span>
      )}
      <Bullets items={bullets.slice(0, 2)} />
    </>
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
const HOST_LABEL = { agentcore: "Amazon Bedrock AgentCore", railway: "Railway" } as const;
const DB_LABEL = { supabase: "Supabase", neon: "Neon" } as const;

function CostEstimate({ projectId, refreshKey, mode, login }: { projectId: string; refreshKey: string; mode: "summary" | "edit"; login?: LoginId }) {
  const [data, setData] = useState<CostResp | null>(null);
  const [runs, setRuns] = useState<string>("");

  async function load(body?: Record<string, unknown>) {
    const q = login ? `?login=${login}` : "";
    const d = await fetch(`/api/projects/${projectId}/agent-cost${q}`, {
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
  if (mode === "summary") {
    return (
      <>
        <Row label="Agent host">
          {HOST_LABEL[data.host]}
          {data.host === "agentcore" && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Recommended</span>}
        </Row>
        <Row label="State database">
          {DB_LABEL[data.db]}
          {data.db === "supabase" && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Recommended</span>}
        </Row>
        <Row label="Runs per month">{e.runs_per_month.toLocaleString()}</Row>
        <Row label={<mark className="rounded bg-warn/20 px-1.5 py-0.5 text-warn">Est. monthly total</mark>}>
          <mark className="rounded bg-warn/20 px-1.5 py-0.5 font-semibold text-warn">{money(e.total)}</mark>
          <Bullets items={e.lines.map((l) => `${l.item}: ${money(l.monthly)}`)} />
        </Row>
      </>
    );
  }
  const pick = (cls: boolean) => `rounded-lg border px-3 py-2 text-sm ${cls ? "border-accent/60 bg-accent/5 text-fg" : "border-edge text-muted hover:border-accent/30"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-sm font-medium text-fg">Agent host</span>
        <button className={pick(data.host === "agentcore")} onClick={() => load({ host: "agentcore" })}>{HOST_LABEL.agentcore} <span className="text-[11px] text-accent">Recommended</span></button>
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
      <DocMuted>You add the key for this provider in Engineering, after the build. Evaluations will show whether it does the job as well.</DocMuted>
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

/** Knowledge that lives in the skills. Turning it off turns every skill off, so it asks first. */
function SkillsKnowledgeToggle({ design, run, busy }: { design: Design; run: Run; busy: boolean }) {
  const skills = design.skills ?? [];
  const [confirming, setConfirming] = useState(false);
  if (!skills.length) return null;
  const on = skills.some((s) => s.enabled);
  return (
    <div className={`rounded-lg border p-3 text-sm ${on ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={on && !confirming}
          disabled={busy}
          onChange={(e) => (e.target.checked ? run("skills", { action: "set-all", enabled: true }, "Saving…") : setConfirming(true))}
        />
        <span>
          <span className="font-medium text-fg">Knowledge from its skills</span>
          <span className="block text-muted">What the agent knows about this job, written into its {skills.length} skill{skills.length === 1 ? "" : "s"}.</span>
        </span>
      </label>
      {confirming && (
        <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3">
          <p className="text-warn">
            Turning this off also turns off all {skills.length} skill{skills.length === 1 ? "" : "s"}. The agent loses the steps and facts in them and may not do its job well.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="btn-ghost border-warn/60 text-xs text-warn"
              disabled={busy}
              onClick={() => run("skills", { action: "set-all", enabled: false }, "Saving…").then(() => setConfirming(false))}
            >
              Turn off anyway
            </button>
            <button className="btn-ghost text-xs" onClick={() => setConfirming(false)}>Keep it on</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgeEditor({ design, run, busy }: { design: Design; run: Run; busy: boolean }) {
  const k = design.knowledge ?? { mode: design.retrieval?.enabled ? "rag" : "none", sources: [] };
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const off = (design.skills ?? []).some((s) => s.enabled) ? "skills" : "none";
  return (
    <div className="space-y-3">
      <SkillsKnowledgeToggle design={design} run={run} busy={busy} />
      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${k.mode === "rag" ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
        <input type="checkbox" className="mt-1" checked={k.mode === "rag"} disabled={busy} onChange={(e) => run("knowledge", { mode: e.target.checked ? "rag" : off }, "Saving…")} />
        <span>
          <span className="font-medium text-fg">Document search</span>
          <span className="block text-muted">Also search your documents for answers. Needs an OpenAI key, used only to index them.</span>
        </span>
      </label>
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
        <DocMuted>You add the token in Engineering, after the build. Changing MCP servers is a light change: no code rewrite.</DocMuted>
      </div>
    </div>
  );
}
