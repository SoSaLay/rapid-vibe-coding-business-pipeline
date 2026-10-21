"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { AgentEngineering } from "./AgentEngineering";
import { AgentKeys } from "./AgentKeys";
import { Doc, DocSection, DocMuted } from "./doc/Doc";
import { StageLoading } from "./BuildingRobot";
import { PLATFORMS, modelsFor, platform, runsModel, type PlatformBuild, type PlatformId } from "@/lib/agent/platforms";
import { AGENT_MODELS, type AgentDesign } from "@/lib/agent/design";

type Hosted = Exclude<PlatformId, "self">;
interface HostedStatus {
  builds: Partial<Record<Hosted, PlatformBuild>>;
  /** The path picked here last (Evaluations and Deployment show only it). */
  chosen?: PlatformId;
  connected: Record<Hosted, boolean>;
  model: string | null;
  designVersion: number;
}

const modelLabel = (id: string) => AGENT_MODELS.find((m) => m.id === id)?.label ?? id.split(":")[1] ?? id;

/**
 * Development: three ways to build the agent, always shown as tabs at the top — our way (any model, our
 * code and hosting), on Claude, or on ChatGPT. Each tab is its own page; building one never removes another.
 */
export function AgentDevelopment(props: ComponentProps<typeof AgentEngineering> & { design: AgentDesign | null }) {
  const { projectId, design } = props;
  const [tab, setTab] = useState<PlatformId>("self");
  const [status, setStatus] = useState<HostedStatus | null>(null);
  /** The model pop-up: shown when the picked tab can't run the model chosen in Agent Design. */
  const [needModel, setNeedModel] = useState<Hosted | null>(null);

  const opened = useRef(false);
  const load = () =>
    fetch(`/api/projects/${projectId}/hosted`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setStatus(d);
        // Open on the path picked last time.
        if (!opened.current && d.chosen) setTab(d.chosen);
        opened.current = true;
      })
      .catch(() => {});
  useEffect(() => { load(); }, [projectId, props.designVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = status?.model ?? design?.model.selected ?? "";
  function pick(id: PlatformId) {
    setTab(id);
    // This is now the agent's path: Evaluations and Deployment follow it.
    fetch(`/api/projects/${projectId}/hosted`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "choose", platform: id }) }).catch(() => {});
    if (id !== "self" && model && !runsModel(id, model)) setNeedModel(id);
  }

  return (
    <>
      <div className="mb-8 overflow-hidden rounded-xl border border-edge">
        <div className="grid grid-cols-3 divide-x divide-edge bg-ink/40 text-sm">
          {PLATFORMS.map((p) => {
            const built = p.id === "self" ? !!props.build : !!status?.builds[p.id as Hosted];
            return (
              <button
                key={p.id}
                className={`px-3 py-3 text-left ${tab === p.id ? "bg-accent/15" : "hover:bg-ink/60"}`}
                onClick={() => pick(p.id)}
                aria-pressed={tab === p.id}
              >
                <span className={`flex items-center gap-1.5 font-semibold ${tab === p.id ? "text-fg" : "text-muted"}`}>
                  {p.label}
                  {built && <span className="text-xs text-ok" title="Built">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {needModel && design && (
        <ModelPopup
          projectId={projectId}
          target={needModel}
          design={design}
          onClose={() => { setNeedModel(null); setTab("self"); }}
          onSwitched={() => { setNeedModel(null); load(); props.onUpdated(); }}
        />
      )}

      {tab === "self" ? (
        <AgentEngineering {...props} />
      ) : (
        <HostedBuild
          projectId={projectId}
          target={tab}
          status={status}
          designVersion={props.designVersion}
          model={model}
          onChangeModel={() => setNeedModel(tab)}
          onChanged={load}
        />
      )}
    </>
  );
}

/** Pick a model this platform runs; saves it to Agent Design (and re-approves it). */
function ModelPopup({ projectId, target, design, onClose, onSwitched }: { projectId: string; target: Hosted; design: AgentDesign; onClose: () => void; onSwitched: () => void }) {
  const p = platform(target);
  const options = modelsFor(target);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function choose(id: string) {
    setBusy(id);
    setError(null);
    const post = (path: string, body?: any) =>
      fetch(`/api/projects/${projectId}/agent-design/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());
    const saved = await post("save", { design: { ...design, model: { ...design.model, selected: id }, model_endpoint: undefined, model_price: undefined } }).catch(() => ({ error: "Couldn't save." }));
    const approved = saved.error ? saved : await post("approve").catch(() => ({ error: "Couldn't approve." }));
    setBusy(null);
    if (approved.error) setError(approved.error);
    else onSwitched();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-edge bg-panel p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-fg">{p.label} needs {p.provider === "anthropic" ? "a Claude" : "an OpenAI"} model</h3>
        <p className="mt-2 text-sm text-fg/90">
          This agent uses <span className="font-medium">{modelLabel(design.model.selected)}</span>, which {p.label} can&apos;t run. Pick one of its
          models: it&apos;s saved to Agent Design.{" "}
          <span className="text-muted">If you&apos;ve built the self-hosted agent too, it&apos;s rebuilt on the new model.</span>
        </p>
        <div className="mt-4 space-y-2">
          {options.map((m) => (
            <button
              key={m.id}
              className="w-full rounded-lg border border-edge p-3 text-left text-sm hover:border-accent/60 disabled:opacity-50"
              disabled={!!busy}
              onClick={() => choose(m.id)}
            >
              <span className="font-medium text-fg">{m.label}</span> <span className="text-xs text-muted">{m.tier}</span>
              <span className="block text-xs text-muted">{busy === m.id ? "Switching…" : m.note}</span>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <button className="btn-ghost mt-4 text-sm" disabled={!!busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Building on Claude or ChatGPT: connect, build (or update), test with the example tasks, and open it there. */
function HostedBuild({
  projectId,
  target,
  status,
  designVersion,
  model,
  onChangeModel,
  onChanged,
}: {
  projectId: string;
  target: Hosted;
  status: HostedStatus | null;
  designVersion: number;
  model: string;
  onChangeModel: () => void;
  onChanged: () => void;
}) {
  const p = platform(target);
  const b = status?.builds[target];
  const connected = !!status?.connected[target];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [warn, setWarn] = useState(false);
  const router = useRouter();

  async function act(action: "build" | "test" | "connect" | "complete", label: string, extra: any = {}) {
    setBusy(label);
    setError(null);
    const d = await fetch(`/api/projects/${projectId}/hosted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: target, action, ...extra }),
    }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));
    setBusy(null);
    if (d.error) setError(d.error);
    else setKey("");
    onChanged();
    if (!d.error && action === "complete") router.push(`/project/${projectId}/qa?platform=${target}`);
  }

  if (!status) return <p className="text-sm text-muted">Loading…</p>;
  const fits = !!model && runsModel(target, model);
  const stale = !!b && b.design_version !== designVersion;
  const failed = b?.test ? b.test.cases.filter((c) => !c.ok).length : 0;
  /** What's still open when moving on (the warning lists them). */
  const open = [
    ...(stale ? ["Agent Design changed since it was built"] : []),
    ...(!b?.test ? ["the example tasks haven't been run on it"] : failed ? [`${failed} example task${failed === 1 ? "" : "s"} failed`] : []),
    ...(b?.missing_keys?.length ? [`${b.missing_keys.length} key${b.missing_keys.length === 1 ? " is" : "s are"} still missing`] : []),
  ];

  return (
    <Doc>
      <DocSection title={`Build on ${p.label}`}>
        <DocMuted>
          {target === "claude"
            ? "Anthropic runs this agent and gives every conversation its own sandbox. Its tools run there, keys stay in Anthropic's vault (the agent never sees them), and you can see each run in your Claude Console."
            : "OpenAI runs this agent in a hosted sandbox. Its tools run there, keys stay in OpenAI's vault (the agent never sees them), and you can see each run in your OpenAI dashboard."}
        </DocMuted>

        <div className="mt-4 space-y-2 text-sm">
          <div>
            <span className="text-muted">Model: </span>
            <span className={fits ? "text-fg" : "text-bad"}>{modelLabel(model)}</span>
            {!fits && (
              <button className="ml-2 text-accent underline" onClick={onChangeModel}>
                Pick a {target === "claude" ? "Claude" : "OpenAI"} model
              </button>
            )}
          </div>
          <div>
            <span className="text-muted">Account: </span>
            {connected ? (
              <span className="text-ok">
                ✓ {target === "claude" ? "Uses the Anthropic key you connected in onboarding" : "Uses your connected OpenAI key"}
              </span>
            ) : target === "claude" ? (
              <span className="text-bad">Connect your Anthropic key in onboarding first.</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  className="input h-8 w-56 text-xs"
                  placeholder="Paste your OpenAI API key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <button className="btn-primary text-xs" disabled={!key.trim() || !!busy} onClick={() => act("connect", "Checking your key…", { apiKey: key })}>
                  Connect
                </button>
                <a className="text-xs text-accent underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                  Get a key ↗
                </a>
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn-primary text-sm"
            disabled={!fits || !connected || !!busy}
            onClick={() => act("build", b ? `Updating the ${p.label} agent…` : `Building it on ${p.label} (a minute or two)…`)}
          >
            {b ? (stale ? `Update to your latest design` : `Rebuild on ${p.label}`) : `Build it on ${p.label}`}
          </button>
          {b && (
            <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => act("test", "Running the example tasks on it (a few minutes)…")}>
              Run the example tasks
            </button>
          )}
          {b?.url && (
            <a className="btn-ghost text-sm" href={b.url} target="_blank" rel="noreferrer">
              Open in {target === "claude" ? "Claude Console" : "OpenAI dashboard"} ↗
            </a>
          )}
        </div>
        {busy && <div className="mt-4"><StageLoading text={busy} size="sm" /></div>}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </DocSection>

      {b && (
        <DocSection title={`Your ${p.label} agent`}>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted">Built: </span>{new Date(b.built_at).toLocaleString()} · {modelLabel(b.model)}{stale && !b.error && <span className="ml-2 text-warn">Updating it with your latest design…</span>}</div>
            <div><span className="text-muted">Agent id: </span><code className="text-xs">{b.agent_id}</code>{b.agent_version !== undefined && <span className="text-muted"> · version {String(b.agent_version)}</span>}</div>
            <div className="text-xs text-muted">Every change you make (design, Fix it, the Agent Changer, keys) updates this agent automatically.</div>
            {b.error && <p className="text-bad">{b.error}</p>}
            {!!b.missing_keys?.length && (
              <p className="text-warn">
                Missing keys: {b.missing_keys.join(", ")}. The tools that need them won&apos;t work there until you add them below and rebuild.
              </p>
            )}
          </div>
          {b.test && (
            <div className="mt-4 space-y-2">
              <div className={`text-sm font-semibold ${b.test.ok ? "text-ok" : "text-bad"}`}>
                Example tasks: {b.test.cases.filter((c) => c.ok).length} of {b.test.cases.length} passed
              </div>
              {b.test.cases.map((c, i) => (
                <details key={i} className="rounded-lg border border-edge p-3 text-sm">
                  <summary className="cursor-pointer">
                    <span className={c.ok ? "text-ok" : "text-bad"}>{c.ok ? "✓" : "✗"}</span> {c.input.slice(0, 120)}
                  </summary>
                  <p className="mt-2 text-fg/90">{c.reason}</p>
                  {c.output && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink p-2 text-[11px] text-fg/80">{c.output}</pre>}
                  {c.session_url && (
                    <a className="mt-1 inline-block text-xs text-accent underline" href={c.session_url} target="_blank" rel="noreferrer">
                      See this run on {p.label} ↗
                    </a>
                  )}
                </details>
              ))}
            </div>
          )}
        </DocSection>
      )}

      <AgentKeys projectId={projectId} refreshKey={`${target}-${b?.built_at ?? ""}`} onSaved={onChanged} />

      {b && (
        <div className="mt-12 border-t border-edge pt-8">
          <button
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-100 disabled:opacity-50"
            disabled={!!busy}
            onClick={() => (open.length ? setWarn(true) : act("complete", "Finishing…"))}
          >
            Start Evaluations on {p.label} →
          </button>
          {warn && open.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
              <p className="font-semibold text-fg">You can start Evaluations now, but {open.length > 1 ? `${open.slice(0, -1).join(", ")} and ${open[open.length - 1]}` : open[0]}.</p>
              <p className="mt-2 text-fg/90">That&apos;s fine for a simple or personal agent: something just for you, or that you&apos;re trying out.</p>
              <p className="mt-2 text-fg/90">
                If other people will use this agent, or its work has to be accurate (it sends, buys, changes or decides things), sort these out first.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary text-sm" onClick={() => { setWarn(false); act("complete", "Finishing…"); }}>
                  Continue anyway
                </button>
                <button className="btn-ghost text-sm" onClick={() => setWarn(false)}>
                  Fix them first
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Doc>
  );
}
