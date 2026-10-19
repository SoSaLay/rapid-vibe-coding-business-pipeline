"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeployState } from "@/lib/agent/deploy";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StageStart } from "./StageStart";

interface Status {
  state: DeployState;
  host: "agentcore" | "railway";
  login: string;
  db: "supabase" | "neon";
  hostConnected: boolean;
  hasDatabaseUrl: boolean;
  neonConnected: boolean;
  supabaseConnected: boolean;
  hasJwks: boolean;
  prepared: boolean;
  workspace: string;
}

const HOST_LABEL = { agentcore: "Amazon Bedrock AgentCore", railway: "Railway" };
/** Who uses it, in plain words. */
const LOGIN_LABEL: Record<string, string> = {
  "machine-key": "No one. It does its work and returns the result.",
  "supabase-auth": "People who log in (free to use)",
  "neon-auth": "People who log in (free to use)",
  clerk: "Paying users who log in",
};

/**
 * One deployment step as a toggle: status outside (✓ done, its number, or "Not needed"), and inside
 * a few numbered one-line instructions with the input or button at the bottom. Steps unlock in order.
 */
function Step({ n, state, title, children }: {
  n: number;
  state: "done" | "todo" | "locked" | "skipped";
  title: string;
  children?: React.ReactNode;
}) {
  const icon =
    state === "done" ? "bg-ok text-onbright" : state === "todo" ? "bg-accent text-white" : "bg-edge text-muted";
  const head = (
    <>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${icon}`}>
        {state === "done" ? "✓" : state === "skipped" ? "–" : n}
      </span>
      <span className={`flex-1 text-sm font-semibold ${state === "skipped" || state === "locked" ? "text-muted" : "text-fg"}`}>{title}</span>
      {state === "skipped" && <span className="text-xs text-muted">Not needed</span>}
      {state === "locked" && <span className="text-xs text-muted">Finish the step above first</span>}
    </>
  );
  if (state === "skipped" || state === "locked") {
    return <div className="flex items-center gap-3 rounded-lg border border-edge bg-ink/20 px-4 py-3 opacity-60">{head}</div>;
  }
  return (
    <details className="group rounded-lg border border-edge bg-ink/40" open={state === "todo"}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        {head}
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 border-t border-edge px-4 py-3 text-sm">{children}</div>
    </details>
  );
}

/** An A/B question: one button per option, the current one highlighted. */
function Choice<T extends string>({ question, options, value, disabled, onPick }: {
  question: string;
  options: { id: T; label: string; note?: string }[];
  value: T;
  disabled?: boolean;
  onPick: (id: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 font-medium text-fg">{question}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            disabled={disabled}
            onClick={() => o.id !== value && onPick(o.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${o.id === value ? "border-accent/60 bg-accent/10 text-fg" : "border-edge text-muted hover:border-accent/30"}`}
          >
            <span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {o.label}
            {o.note && <span className="block text-xs text-muted">{o.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** How to get a provider key, and a box to paste it. Saved once and reused for every agent. */
function ProviderKey({ steps, placeholder, disabled, onSave }: { steps: React.ReactNode[]; placeholder: string; disabled: boolean; onSave: (key: string) => void }) {
  const [key, setKey] = useState("");
  return (
    <>
      <Steps items={steps} />
      <div className="flex flex-wrap gap-2">
        <input type="password" autoComplete="off" className="input h-9 min-w-0 flex-1" placeholder={placeholder} value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn-primary text-sm" disabled={disabled || !key.trim()} onClick={() => { onSave(key.trim()); setKey(""); }}>
          Connect
        </button>
      </div>
      <p className="text-xs text-muted">Or paste a connection string you already have:</p>
    </>
  );
}

/**
 * In the Deployment title row (right side): new changes to the agent and getting them live. Deploying = push to
 * GitHub, where the agent's workflow re-runs the tests and evals and releases a test copy.
 */
export function LatestChanges({ projectId, autoflow, github, onUpdated }: {
  projectId: string;
  autoflow: { running: boolean; stage: string; phase: string | null; message: string; error?: string; run_url?: string } | null;
  github: { built: boolean; connected: boolean; mode: "ask" | "auto" | null; unpushed: number; url?: string | null } | null;
  onUpdated: () => void;
}) {
  const [sending, setSending] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    setSending(true);
    await fetch(`/api/projects/${projectId}/github`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    setSending(false);
    onUpdated();
  };
  const runLink = autoflow?.run_url ? <a className="text-accent underline" href={autoflow.run_url} target="_blank" rel="noreferrer">Open on GitHub ↗</a> : null;

  if (autoflow?.running && autoflow.phase === "deployment") {
    return (
      <Card tone="info">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        <span>{autoflow.message}</span>
        {runLink}
      </Card>
    );
  }
  if (autoflow?.running && autoflow.phase === "engineering") {
    return (
      <Card tone="info">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        <span>Building your latest changes…</span>
      </Card>
    );
  }
  const n = github?.unpushed ?? 0;
  if (!n) {
    if (autoflow?.stage === "deployed") return <Card tone="ok"><span>✓ Changes deployed</span>{runLink}</Card>;
    if (autoflow?.stage === "failed" && autoflow.error) return <Card tone="bad"><span title={autoflow.error}>{autoflow.message}</span>{runLink}</Card>;
    return github?.built ? <Card tone="ok"><span>✓ No new changes to deploy</span></Card> : null;
  }
  const changes = `${n} new change${n === 1 ? "" : "s"}`;
  if (!github?.connected) {
    return (
      <Card tone="warn">
        <span>
          <span className="font-semibold">You have {changes} to your agent.</span> Connect GitHub in onboarding to deploy them.
        </span>
        <Link className="btn-ghost text-sm" href={`/project/${projectId}`}>Open onboarding</Link>
      </Card>
    );
  }
  return (
    <Card tone="warn">
      <span>
        <span className="font-semibold">You have {changes} to your agent.</span>
        {autoflow?.stage === "failed" && autoflow.error && <span className="block text-bad">Last try failed: {autoflow.error}</span>}
      </span>
      <div className="flex flex-wrap gap-2">
        {github.mode !== "auto" && (
          <button className="btn-ghost text-sm" disabled={sending} onClick={() => post({ action: "mode", mode: "auto", deploy: true })}>
            Always deploy automatically
          </button>
        )}
        <button
          className="btn-ghost text-sm"
          disabled={sending}
          onClick={() => post(github.mode === null ? { action: "mode", mode: "ask", deploy: true } : { action: "deploy" })}
        >
          Push &amp; deploy now
        </button>
      </div>
    </Card>
  );
}

function Card({ tone, children }: { tone: "warn" | "bad" | "info" | "ok"; children: React.ReactNode }) {
  const cls = {
    warn: "border-warn/50 bg-warn/10 text-fg",
    bad: "border-bad/50 bg-bad/10 text-bad",
    info: "border-accent/40 bg-accent/10 text-fg",
    ok: "border-ok/40 bg-ok/10 text-ok opacity-80",
  }[tone];
  return <div className={`ml-auto flex flex-col items-end gap-2 rounded-xl border px-4 py-3 text-right text-sm ${cls}`}>{children}</div>;
}

function TestDeployButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** 🔒 / 🔓 with a one-line hover note on what unlocks it. */
function Lock({ open, why }: { open: boolean; why: string }) {
  return (
    <span tabIndex={open ? undefined : 0} className="group relative shrink-0 cursor-default text-base outline-none" aria-label={open ? "Unlocked" : `Locked: ${why}`}>
      {open ? "🔓" : "🔒"}
      {!open && (
        <span role="tooltip" className="pointer-events-none absolute bottom-7 right-0 z-30 hidden w-64 rounded-lg border border-edge bg-panel p-2.5 text-xs leading-relaxed text-fg shadow-xl group-hover:block group-focus:block">
          {why}
        </span>
      )}
    </span>
  );
}

/** Where to see a released copy: its web address, or (AgentCore) the agent in the AWS console. */
function targetLink(t: { url?: string; arn?: string; region?: string }): string | null {
  if (t.url) return t.url;
  if (t.arn) {
    const region = t.region || t.arn.split(":")[3] || "us-east-1";
    return `https://${region}.console.aws.amazon.com/bedrock-agentcore/home?region=${region}`;
  }
  return null;
}

/** Short numbered instructions inside a step. */
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-fg/90">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ol>
  );
}

/** Agent pipeline — stage 6. Package → database → login → staging → live check → approve → production (+ rollback). */
export function AgentDeployment({
  projectId,
  hasEvals,
  completed,
  autoflow = null,
  github = null,
  autostart = false,
  onUpdated,
}: {
  projectId: string;
  hasEvals: boolean;
  completed: boolean;
  autoflow?: { running: boolean; stage: string; phase: string | null; message: string; error?: string; run_url?: string } | null;
  github?: { built: boolean; connected: boolean; mode: "ask" | "auto" | null; unpushed: number; url?: string | null } | null;
  autostart?: boolean;
  onUpdated: () => void;
}) {
  const autoRan = useRef(false);
  const autoKey = useRef<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [jwks, setJwks] = useState("");
  const [urls, setUrls] = useState<{ staging?: string; production?: string }>({});

  async function load() {
    const d = await fetch(`/api/projects/${projectId}/deploy`).then((r) => r.json()).catch(() => null);
    if (d) {
      setSt(d);
      setUrls(d.state.railway_urls ?? {});
    }
  }
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(path: string, body: any, label: string) {
    setBusy(label);
    setError(null);
    setLog(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || d.db?.error || "That step failed.");
        setLog(d.log || d.output || d.release?.log || d.db?.error || null);
      }
      await load();
      onUpdated();
    } catch (e: any) {
      setError(e?.message || "Request failed.");
    }
    setBusy(null);
  }

  /** Save a database provider's key (used for every agent), then reload. */
  async function connect(id: "neon" | "supabase-mgmt", values: Record<string, string>) {
    setBusy("Connecting…");
    setError(null);
    const d = await fetch("/api/agent-tools/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, values }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Couldn't connect." }));
    setBusy(null);
    if (!d.ok) setError(d.error || "Couldn't connect.");
    await load();
  }

  if (autostart && hasEvals && st && !st.prepared && !st.state.prepared_at && !busy && !autoRan.current) {
    autoRan.current = true;
    setTimeout(() => post("prepare", {}, "Packaging (first time installs a few packages)…"), 0);
  }
  if (!hasEvals) return <StageStart label="Start Deployment" locked="Finish Evaluations first." onStart={() => {}} />;
  if (!st) return <div className="card p-6 text-sm text-muted">Loading…</div>;

  const s = st.state;
  if (!s.prepared_at) {
    return <StageStart label="Start Deployment" busy={busy} error={error} onStart={() => post("prepare", {}, "Packaging your agent (first time installs a few packages)…")} />;
  }
  const railway = st.host === "railway";
  const jwt = st.login !== "machine-key";
  const needsJwks = jwt && st.login !== "supabase-auth";
  const stage = s.staging ?? (railway ? s.production : undefined);
  const checkedThis = !!stage && s.check?.release === stage.release.id;
  const live = s.production;
  const canRollback = s.history.filter((h) => h.ok && h.env === "production" && h.id !== live?.release.id).length > 0;

  // Each step unlocks once the ones before it are done.
  const loginNeeded = jwt || railway; // anyone logs in (Clerk or Supabase), or Railway needs its web address
  const done = {
    pkg: st.prepared && !!s.prepared_at,
    db: !!s.db?.ok,
    login: !loginNeeded || ((!needsJwks || st.hasJwks) && (st.login !== "supabase-auth" || st.db === "supabase") && (!railway || !!urls.production)),
    release: !!stage?.release.ok,
    check: checkedThis && !!s.check?.passed,
    live: !!live && live.release.id === stage?.release.id,
  };
  const order: (keyof typeof done)[] = ["db", "login"];
  // The database (and login, when people log in) are all the owner sets up; the rest happens on its own.
  const setupDone = done.db && done.login;
  const stateOf = (k: keyof typeof done): "done" | "todo" | "locked" | "skipped" => {
    if (k === "login" && !loginNeeded) return "skipped";
    if (done[k]) return "done";
    return order.slice(0, order.indexOf(k)).every((p) => done[p]) ? "todo" : "locked";
  };

  // Once set up: release a test copy and check it on its own (first time, or when the copy hasn't been checked).
  if (setupDone && st.hostConnected && !busy && !error && autoKey.current !== `${stage?.release.id ?? "none"}`) {
    autoKey.current = `${stage?.release.id ?? "none"}`;
    if (!stage) {
      setTimeout(async () => {
        await post("release", {}, "Releasing a test copy (a few minutes)…");
      }, 0);
    } else if (!checkedThis) {
      setTimeout(() => post("check", {}, "Checking the test copy…"), 0);
    }
  }

  return (
    <Doc>
      <div className="card mb-8 divide-y divide-edge text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
          <span className="w-32 font-medium text-fg">Host</span>
          <span className="text-fg/90">{HOST_LABEL[st.host]}{st.hostConnected ? "" : " · not connected yet (add it in onboarding)"}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
          <span className="w-32 font-medium text-fg">Who uses it</span>
          <span className="text-fg/90">{LOGIN_LABEL[st.login] ?? st.login}</span>
        </div>
      </div>

      <DocSection title="Deployment steps">
        <div className="space-y-2">
          <Step n={1} state={stateOf("db")} title="Agent database">
            <Choice
              question="Which database should your agent use?"
              options={[
                { id: "supabase", label: "Supabase" },
                { id: "neon", label: "Neon" },
              ]}
              value={st.db}
              disabled={!!busy}
              onPick={(db) => post("settings", { db }, "Saving…")}
            />
            {st.db === "neon" ? (
              <>
                {st.neonConnected ? (
                  <>
                    <Steps items={["Click Create a database for me (free).", "Or paste a Neon connection string below and click Save & set up."]} />
                    <button className="btn-primary text-sm" disabled={!!busy} onClick={() => post("database", { create: "neon" }, "Creating a free Neon database…")}>
                      Create a database for me
                    </button>
                  </>
                ) : (
                  <ProviderKey
                    steps={[
                      <>Sign in at <a className="text-accent underline" href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noreferrer">neon.tech</a> (free).</>,
                      "Open Account settings → API keys and create a key.",
                      "Paste it below and click Connect. Then click Create a database for me.",
                    ]}
                    placeholder="Neon API key"
                    disabled={!!busy}
                    onSave={(key) => connect("neon", { apiKey: key })}
                  />
                )}
              </>
            ) : (
              <>
                {st.supabaseConnected ? (
                  <>
                    <Steps items={["Click Create a database for me (free; takes a minute or two).", "Or paste a Supabase connection string below (Connect → Session pooler) and click Save & set up."]} />
                    <button
                      className="btn-primary text-sm"
                      disabled={!!busy}
                      onClick={() => post("database", { create: "supabase" }, "Creating a free Supabase database (a minute or two)…")}
                    >
                      Create a database for me
                    </button>
                  </>
                ) : (
                  <ProviderKey
                    steps={[
                      <>Sign in at <a className="text-accent underline" href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">supabase.com</a> (free).</>,
                      "Open Account → Access Tokens and click Generate new token.",
                      "Paste it below and click Connect. Then click Create a database for me.",
                    ]}
                    placeholder="Supabase access token (sbp_…)"
                    disabled={!!busy}
                    onSave={(key) => connect("supabase-mgmt", { accessToken: key })}
                  />
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                className="input h-9 min-w-0 flex-1"
                placeholder={st.hasDatabaseUrl ? "Saved — paste to replace" : "postgresql://…"}
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
              />
              <button
                className="btn-ghost text-sm"
                disabled={!!busy || (!dbUrl && !st.hasDatabaseUrl)}
                onClick={async () => {
                  if (dbUrl) await post("settings", { databaseUrl: dbUrl }, "Saving…");
                  setDbUrl("");
                  await post("database", {}, "Creating tables…");
                }}
              >
                Save &amp; set up
              </button>
            </div>
          </Step>

          <Step n={2} state={stateOf("login")} title={railway ? "Agent login & web address" : "Agent login"}>
            {jwt && (
              <>
                <Choice
                  question="Which login should people use?"
                  options={[
                    { id: "clerk", label: "Clerk", note: "Login + payments" },
                    { id: "supabase-auth", label: "Supabase", note: "Free; needs a Supabase database" },
                  ]}
                  value={st.login === "clerk" ? "clerk" : "supabase-auth"}
                  disabled={!!busy}
                  onPick={async (login) => {
                    await post("settings", { login }, "Switching login…");
                    await post("prepare", {}, "Re-packaging for the new login…");
                  }}
                />
                {st.login === "clerk" ? (
                  <>
                    <Steps items={["In the Clerk dashboard, open API Keys.", "Copy the JWKS URL (ends in /.well-known/jwks.json).", "Paste it below and click Save."]} />
                    <div className="flex flex-wrap gap-2">
                      <input className="input h-9 min-w-0 flex-1" placeholder={st.hasJwks ? "Saved — paste to replace" : "https://…/.well-known/jwks.json"} value={jwks} onChange={(e) => setJwks(e.target.value)} />
                      <button className="btn-ghost text-sm" disabled={!!busy || !jwks} onClick={() => post("settings", { jwksUrl: jwks }, "Saving…").then(() => setJwks(""))}>Save</button>
                    </div>
                  </>
                ) : (
                  <p className="text-fg/90">
                    {st.db === "supabase" ? "Nothing to paste: it uses your Supabase database's login." : "Supabase login needs a Supabase database: switch the database in step 2 to Supabase."}
                  </p>
                )}
              </>
            )}
            {railway && (
              <>
                <Steps items={["In Railway, open your service → Settings → Networking.", "Click Generate domain and copy it.", "Paste it below and click Save."]} />
                {(["production", "staging"] as const).map((env) => (
                  <div key={env} className="flex flex-wrap items-center gap-2">
                    <span className="w-20 text-xs text-muted">{env}</span>
                    <input
                      className="input h-9 min-w-0 flex-1"
                      placeholder={env === "staging" ? "optional" : "https://….up.railway.app"}
                      value={urls[env] ?? ""}
                      onChange={(e) => setUrls({ ...urls, [env]: e.target.value })}
                    />
                  </div>
                ))}
                <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => post("settings", { railwayUrls: urls }, "Saving…")}>Save</button>
              </>
            )}
          </Step>

        </div>
        {/* What the steps unlock: a checked test copy, then going live. */}
        <div className="card mt-4 divide-y divide-edge text-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-52 shrink-0 font-medium text-fg">Deploy agent for testing</span>
            <span className="min-w-0 flex-1">
              {busy && /Releasing|Checking/.test(busy) ? (
                <span className="text-muted">{busy}</span>
              ) : setupDone && stage ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <TestDeployButton label="🧪 Redeploy" disabled={!!busy || !st.hostConnected} onClick={() => post("release", {}, "Releasing a test copy (a few minutes)…")} />
                  {targetLink(stage.target) ? (
                    <a className="text-accent underline" href={targetLink(stage.target)!} target="_blank" rel="noreferrer">Check the test copy ↗</a>
                  ) : (
                    <span className="text-fg/90">Released ({stage.release.id})</span>
                  )}
                  {checkedThis && s.check && (
                    <span className={`text-xs ${s.check.passed ? "text-ok" : "text-bad"}`}>{s.check.passed ? "✓ Passed its checks" : "✗ Failed its checks"}</span>
                  )}
                  {checkedThis && s.check && !s.check.passed && !busy && (
                    <button className="text-xs text-accent underline" onClick={() => post("check", {}, "Checking the test copy…")}>Check again</button>
                  )}
                </span>
              ) : (
                <TestDeployButton label="🧪 Deploy" disabled={!setupDone || !!busy || !st.hostConnected} onClick={() => post("release", {}, "Releasing a test copy (a few minutes)…")} />
              )}
            </span>
            <Lock open={setupDone} why="Set up the agent database (and login, if needed) above to unlock." />
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-52 shrink-0 font-medium text-fg">Deploy agent for production</span>
            <span className="min-w-0 flex-1">
              {live ? (
                <span className="flex flex-wrap items-center gap-x-3">
                  {targetLink(live.target) ? (
                    <a className="text-accent underline" href={targetLink(live.target)!} target="_blank" rel="noreferrer">Open the live agent ↗</a>
                  ) : (
                    <span className="text-fg/90">Release {live.release.id}</span>
                  )}
                  {canRollback && (
                    <button className="text-xs text-muted underline" disabled={!!busy} onClick={() => post("promote", { action: "rollback" }, "Rolling back…")}>
                      Roll back
                    </button>
                  )}
                </span>
              ) : null}
              {!done.live && (
                <button
                  className="rounded-lg bg-ok px-4 py-1.5 text-sm font-semibold text-onbright transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  disabled={!!busy || !done.check}
                  onClick={() => post("promote", { action: "promote" }, "Going live…")}
                >
                  🚀 Go live
                </button>
              )}
            </span>
            <Lock
              open={done.check || done.live}
              why={
                !setupDone
                  ? "Set up the agent database (and login, if needed) above first."
                  : checkedThis && s.check && !s.check.passed
                    ? "The testing copy failed its checks: fix them in Evaluations, then check again."
                    : "Unlocks once the agent is deployed for testing and passes its checks."
              }
            />
          </div>
        </div>
        {busy && !/Releasing|Checking/.test(busy) && <StageLoading text={busy} size="sm" />}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {log && <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{log}</pre>}
      </DocSection>


      {s.history.length > 0 && (
        <DocSection title="Release history">
          <ul className="space-y-1 text-sm">
            {[...s.history].reverse().map((h, i) => (
              <li key={h.id + h.at + i}>
                <span className={h.ok ? "text-ok" : "text-bad"}>{h.ok ? "✓" : "✗"}</span> <code className="text-fg">{h.id}</code>{" "}
                <span className="text-xs text-muted">→ {h.env}{h.version ? ` (v${h.version})` : ""} · {new Date(h.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </DocSection>
      )}


      {!completed && (
        <div className="mt-12 border-t border-edge pt-8">
          <button disabled className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white opacity-50 shadow-lg">
            Start Operations →
          </button>
          <p className="mt-2 text-center text-xs text-muted">Unlocks once the agent is live.</p>
        </div>
      )}
    </Doc>
  );
}
