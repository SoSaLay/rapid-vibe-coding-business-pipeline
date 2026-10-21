"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { AgentDeployment } from "./AgentDeployment";
import { platform as platformInfo, type PlatformBuild, type PlatformId } from "@/lib/agent/platforms";

type Hosted = Exclude<PlatformId, "self">;

/**
 * Deployment for the path picked in Development, and only that one: the self-hosted agent keeps its full
 * deployment page; an agent on Claude or ChatGPT is already live there, so it's one table row (status, links,
 * details). The platform takes care of hosting, sign-in and versions.
 */
export function DeploymentTabs(props: ComponentProps<typeof AgentDeployment> & { selfBuilt: boolean }) {
  const { projectId, selfBuilt } = props;
  const [status, setStatus] = useState<{ builds: Partial<Record<Hosted, PlatformBuild>>; chosen: PlatformId } | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/hosted`)
      .then((r) => r.json())
      .then((d) => setStatus({ builds: d?.builds ?? {}, chosen: d?.chosen ?? "self" }))
      .catch(() => setStatus({ builds: {}, chosen: "self" }));
  }, [projectId]);
  if (!status) return <p className="text-sm text-muted">Loading…</p>;

  // Only the path picked in Development.
  const chosen = status.chosen;
  if (chosen === "self") return selfBuilt ? <AgentDeployment {...props} /> : <p className="text-sm text-muted">Build the self-hosted agent in Development first.</p>;
  const b = status.builds[chosen];
  if (!b) return <p className="text-sm text-muted">Build it on {platformInfo(chosen).label} in Development first.</p>;
  return <HostedDeployTable projectId={projectId} b={b} />;
}

const GRID = "grid grid-cols-[11rem_minmax(0,1fr)_14rem] items-center gap-4 px-4";

/** The agent on Claude / ChatGPT: one row, like the self-hosted deployment table. */
function HostedDeployTable({ projectId, b }: { projectId: string; b: PlatformBuild }) {
  const p = platformInfo(b.platform);
  const console = b.platform === "claude" ? "Open in Claude Console" : "Open in OpenAI dashboard";
  const passed = b.test ? `${b.test.cases.filter((c) => c.ok).length} of ${b.test.cases.length} example tasks passed` : null;
  return (
    <section className="mb-16">
      <div className="overflow-x-auto rounded-2xl border-2 border-accent/60 bg-accent/[0.07] text-sm shadow-[0_0_40px_-12px] shadow-accent/50">
        <div className="min-w-[620px] divide-y divide-accent/25">
          <div className={`${GRID} py-2 text-[11px] font-semibold uppercase tracking-wider text-muted`}>
            <span>Agent</span>
            <span>Status</span>
            <span>Live links</span>
          </div>
          <div className={`${GRID} py-4`}>
            <span className="font-medium text-fg">{p.label}</span>
            <span className="flex min-w-0 flex-col gap-1">
              {b.error ? (
                <span className="font-semibold text-bad">{b.error}</span>
              ) : (
                <span className="font-semibold text-ok">✓ Live on {p.label}</span>
              )}
              <span className="text-xs text-muted">
                Built {new Date(b.built_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {b.agent_version !== undefined ? ` · version ${String(b.agent_version)}` : ""} · {b.model.split(":")[1] ?? b.model}
              </span>
              <span className="text-xs text-muted">
                Agent id <code className="break-all">{b.agent_id}</code>
              </span>
              {passed && <span className="text-xs text-muted">{passed}</span>}
              {!!b.missing_keys?.length && <span className="text-xs text-warn">Missing keys: {b.missing_keys.join(", ")}</span>}
            </span>
            <span className="flex flex-col gap-1.5">
              {b.url && (
                <a className="text-accent underline" href={b.url} target="_blank" rel="noreferrer">
                  {console} ↗
                </a>
              )}
              <a className="text-accent underline" href={`/project/${projectId}/engineering`}>
                Update or test it
              </a>
            </span>
          </div>
          <ChatRow projectId={projectId} />
        </div>
      </div>
    </section>
  );
}


interface ChatStatus {
  applicable: boolean;
  auth?: "clerk" | "supabase";
  authKeys?: { env: string; label: string; help: string }[];
  missing?: string[];
  vercelConnected?: boolean;
  chat?: { url?: string; deployed_at?: string; error?: string } | null;
}

/** The chat page row: where people sign in and talk to the agent (set up once, then it stays up to date). */
function ChatRow({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<ChatStatus | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch(`/api/projects/${projectId}/chat`).then((r) => r.json()).then(setSt).catch(() => {});
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(url: string, body: any, label: string) {
    setBusy(label);
    setError(null);
    const d = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => ({ error: "That didn't work." }));
    setBusy(null);
    if (d.error) setError(d.error);
    await load();
    return !d.error;
  }

  if (!st) return null;
  if (!st.applicable) {
    return (
      <div className={`${GRID} py-4`}>
        <span className="font-medium text-fg">Chat page</span>
        <span className="text-xs text-muted">None: Agent Design says this agent runs on its own (nobody chats with it).</span>
        <span />
      </div>
    );
  }
  const authName = st.auth === "supabase" ? "Supabase" : "Clerk";
  const needKeys = (st.authKeys ?? []).filter((k) => (st.missing ?? []).includes(k.label));
  const live = st.chat?.url;
  return (
    <div className={`${GRID} py-4`}>
      <span className="flex flex-col">
        <span className="font-medium text-fg">Chat page</span>
        <span className="text-xs text-muted">Sign-in with {authName}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-2 text-xs">
        {live ? (
          <span className="text-sm font-semibold text-ok">✓ Online</span>
        ) : (
          <span className="text-muted">People sign in here and chat with the agent. Each person only sees their own conversations.</span>
        )}
        {st.chat?.deployed_at && <span className="text-muted">Updated {new Date(st.chat.deployed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        {needKeys.map((k) => (
          <label key={k.env} className="flex flex-col gap-1">
            <span className="text-muted">{k.label} · {k.help}</span>
            <input type="password" className="input h-8 text-xs" value={values[k.env] ?? ""} onChange={(e) => setValues({ ...values, [k.env]: e.target.value })} />
          </label>
        ))}
        {needKeys.length > 0 && (
          <button
            className="btn-ghost self-start text-xs"
            disabled={!!busy || needKeys.some((k) => !values[k.env]?.trim())}
            onClick={async () => { if (await post(`/api/projects/${projectId}/agent-design/credentials`, { values }, "Saving…")) setValues({}); }}
          >
            Save {authName} keys
          </button>
        )}
        {!st.vercelConnected && (
          <label className="flex flex-col gap-1">
            <span className="text-muted">Vercel token (puts the page online) · vercel.com/account/tokens → Create</span>
            <span className="flex gap-2">
              <input type="password" className="input h-8 flex-1 text-xs" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="btn-ghost text-xs" disabled={!token.trim() || !!busy} onClick={async () => { if (await post(`/api/projects/${projectId}/chat`, { action: "connect-vercel", token }, "Checking…")) setToken(""); }}>
                Connect
              </button>
            </span>
          </label>
        )}
        {st.auth === "supabase" && live && <span className="text-muted">In Supabase → Authentication → URL Configuration, add {live} so sign-in links work.</span>}
        {busy && <span className="text-accent">{busy}</span>}
        {(error || st.chat?.error) && <span className="text-bad">{error || st.chat?.error}</span>}
      </span>
      <span className="flex flex-col gap-1.5">
        {live && (
          <a className="text-accent underline" href={live} target="_blank" rel="noreferrer">
            Open chat page ↗
          </a>
        )}
        <button
          className="btn-primary self-start text-xs"
          disabled={!!busy || !st.vercelConnected || needKeys.length > 0}
          onClick={() => post(`/api/projects/${projectId}/chat`, { action: "deploy" }, "Putting it online (a minute or two)…")}
        >
          {live ? "Update chat page" : "Put it online"}
        </button>
      </span>
    </div>
  );
}
