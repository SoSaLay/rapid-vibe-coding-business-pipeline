"use client";

import { StageLoading } from "./BuildingRobot";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeployState } from "@/lib/agent/deploy";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StageStart } from "./StageStart";

interface Status {
  state: DeployState;
  /** Release id → what changed since the release before it. */
  notes?: Record<string, string>;
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
  // While Engineering rebuilds, Deployment shows nothing here: the sidebar shows Engineering working.
  if (autoflow?.running && autoflow.phase === "engineering") return null;
  const n = github?.unpushed ?? 0;
  if (!n) {
    if (autoflow?.stage === "deployed") return <Card tone="ok"><span>✓ Changes deployed</span>{runLink}</Card>;
    if (autoflow?.stage === "failed" && autoflow.error) {
      return (
        <Card tone="bad">
          <span className="font-semibold">{autoflow.message}</span>
          <span className="max-w-sm text-xs text-fg/80">{autoflow.error}</span>
          <span className="flex items-center gap-3">
            {runLink}
            <button className="btn-ghost text-sm" disabled={sending} onClick={() => post({ action: "deploy" })}>Try again</button>
          </span>
        </Card>
      );
    }
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

/** A failed step, named for the person reading the technical output. */
function actionName(path: string, body: any): string {
  if (path === "release") return "Deploy for testing";
  if (path === "check") return "Check of the live testing agent";
  if (path === "promote") return body?.action === "rollback" ? "Roll back" : body?.release ? "Redeploy of an earlier version" : "Go live";
  if (path === "database") return "Agent database setup";
  if (path === "settings") return "Saving settings";
  if (path === "prepare") return "Packaging the agent";
  return "Last step";
}

/** Subheadings inside Deployment watchlogs, in their own color so they read as separate parts. */
function WatchHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold uppercase tracking-wider text-accent2">{children}</div>;
}

/** The last 10 releases; ↻ (with a confirm) makes a passed version live again. */
function ReleaseTable({ history, notes, passed, liveId, busy, onRedeploy }: {
  history: DeployState["history"];
  notes: Record<string, string>;
  passed: (id: string) => boolean;
  liveId?: string;
  busy: boolean;
  onRedeploy: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = [...history].reverse().slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-xl border border-edge">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-panel text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-semibold">Version</th>
            <th className="px-3 py-2 font-semibold">Where</th>
            <th className="px-3 py-2 font-semibold">When</th>
            <th className="px-3 py-2 font-semibold">Checks</th>
            <th className="bg-accent/20 px-3 py-2 text-center font-semibold text-accent">Redeploy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const ok = passed(h.id);
            const isLive = h.env === "production" && h.id === liveId;
            const label = h.version ? `v${h.version}` : h.id;
            return (
              <tr key={h.id + h.at + i} className="border-t border-edge bg-ink/40 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-fg">{label}</div>
                  {notes[h.id] && <div className="max-w-xs truncate text-xs text-muted" title={notes[h.id]}>{notes[h.id]}</div>}
                </td>
                <td className="px-3 py-2 text-fg/90">
                  {h.env === "staging" ? "Testing" : "Production"}
                  {isLive && <span className="ml-2 rounded-full bg-ok/20 px-2 py-0.5 text-[11px] font-semibold text-ok">Live</span>}
                  {!h.ok && <span className="ml-2 text-xs text-bad">failed</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{new Date(h.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td className="px-3 py-2 text-xs">{!h.ok ? <span className="text-muted">—</span> : ok ? <span className="text-ok">✓ Passed</span> : <span className="text-muted">Not passed</span>}</td>
                <td className="bg-accent/10 px-3 py-2 text-center">
                  {isLive ? (
                    <span className="text-xs text-muted">Live now</span>
                  ) : !(h.ok && ok && h.version) ? (
                    <span className="group relative inline-block">
                      <button className="cursor-not-allowed rounded-md bg-accent/30 px-2.5 py-1 text-sm font-semibold text-white/70 opacity-50" disabled aria-label="Can't redeploy this version">↻</button>
                      <span role="tooltip" className="pointer-events-none absolute bottom-9 right-0 z-30 hidden w-56 rounded-lg border border-edge bg-panel p-2 text-left text-xs text-fg shadow-xl group-hover:block">
                        {!h.ok ? "This release failed, so it can't go live." : !h.version ? "This release has no stored version to switch to." : "Only versions that passed their checks can go live."}
                      </span>
                    </span>
                  ) : (
                    confirm === h.id ? (
                      <span className="flex items-center justify-end gap-2 whitespace-nowrap text-xs">
                        <span className="text-fg">Make {label} live again?</span>
                        <button className="rounded-md bg-ok px-2 py-1 font-semibold text-onbright" disabled={busy} onClick={() => { setConfirm(null); onRedeploy(h.id); }}>Yes</button>
                        <button className="text-muted underline" onClick={() => setConfirm(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button
                        className="rounded-md bg-accent px-2.5 py-1 text-sm font-semibold text-white shadow transition-transform hover:scale-105 disabled:opacity-40"
                        disabled={busy}
                        title={`Redeploy ${label} to production`}
                        aria-label={`Redeploy ${label} to production`}
                        onClick={() => setConfirm(h.id)}
                      >
                        ↻
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 🔒 with a one-line hover note on what unlocks it; once unlocked it disappears (its space stays, so rows line up). */
function Lock({ open, why, working = false }: { open: boolean; why: string; working?: boolean }) {
  // While the row is doing something, a spinner takes the lock's place.
  if (working) {
    return (
      <span className="flex w-5 shrink-0 justify-center" aria-label="Working">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </span>
    );
  }
  if (open) return <span className="w-5 shrink-0" aria-hidden />;
  return (
    <span tabIndex={0} className="group relative w-5 shrink-0 cursor-default text-base outline-none" aria-label={`Locked: ${why}`}>
      🔒
      <span role="tooltip" className="pointer-events-none absolute bottom-7 left-0 z-30 hidden w-64 rounded-lg border border-edge bg-panel p-2.5 text-xs leading-relaxed text-fg shadow-xl group-hover:block group-focus:block">
        {why}
      </span>
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
  // Quick start is shown by default; the other column's heading switches to traditional setup.
  const [dbMode, setDbMode] = useState<"quick" | "api">("quick");
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  /** The last failure, in one plain line, and who needs to act. */
  const [plain, setPlain] = useState<{ who: "you" | "agent" | "pipeline"; line: string } | null>(null);
  /** Which action the last failure came from, and when (shown at the top of the technical output). */
  const [failedAction, setFailedAction] = useState<{ what: string; at: string } | null>(null);
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
  // A background release (GitHub) records its version and checks it: pick that up as it happens.
  useEffect(() => { if (autoflow) load(); }, [autoflow?.stage, autoflow?.message]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Every outcome, success or failure, becomes the most recent entry in Technical output.
      const event: Record<string, unknown> = { what: actionName(path, body), ok: res.ok, at: new Date().toISOString() };
      const record = (e: Record<string, unknown>) =>
        fetch(`/api/projects/${projectId}/deploy/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }).catch(() => {});
      if (!res.ok) {
        const err = d.error || d.db?.error || "That step failed.";
        const raw = d.log || d.output || d.release?.log || d.db?.error || null;
        setError(err);
        setLog(raw);
        Object.assign(event, { error: err, log: raw ?? undefined });
        await record(event);
        fetch(`/api/projects/${projectId}/deploy/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: err, log: raw ?? "" }),
        })
          .then((r) => r.json())
          .then(async (x) => {
            if (!x.line) return;
            await record({ ...event, plain: x });
            await load();
          })
          .catch(() => {});
      } else if (path !== "settings" && path !== "check") {
        // A finished check reports its own pass/fail (from the saved check), so it isn't recorded as an action.
        await record(event);
      }
      await load();
      onUpdated();
    } catch (e: any) {
      setError(e?.message || "Request failed.");
    }
    setBusy(null);
  }

  /**
   * Quick start: sign in to the provider through its MCP server (popup, first time only),
   * then create the database and set it up.
   */
  async function quickStart() {
    if (!st) return;
    const provider = st.db;
    const create = async (): Promise<any> =>
      fetch(`/api/projects/${projectId}/deploy/quickstart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the pipeline." }));
    setError(null);
    setBusy(`Connecting to ${provider === "neon" ? "Neon" : "Supabase"}…`);
    let d = await create();
    if (d.signIn) {
      setBusy("Sign in in the window that just opened…");
      const win = window.open(d.signIn, "mcp-signin", "width=520,height=720");
      if (!win) {
        setBusy(null);
        setError("Your browser blocked the sign-in window. Allow pop-ups for this page and try again.");
        return;
      }
      const ok = await new Promise<boolean>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== location.origin || e.data?.type !== "mcp-auth") return;
          window.removeEventListener("message", onMsg);
          clearInterval(t);
          resolve(!!e.data.ok);
        };
        window.addEventListener("message", onMsg);
        const t = setInterval(() => {
          if (win.closed) {
            clearInterval(t);
            window.removeEventListener("message", onMsg);
            resolve(false);
          }
        }, 800);
      });
      if (!ok) {
        // The window may have closed right after a successful sign-in: check before giving up.
        const again = await fetch(`/api/mcp-auth/start?provider=${provider}`).then((r) => r.json()).catch(() => ({}));
        if (!again.signedIn) {
          setBusy(null);
          setError("Sign-in didn't finish. Try Quick start again.");
          return;
        }
      }
      setBusy(provider === "supabase" ? "Creating your Supabase database (a minute or two)…" : "Creating your Neon database…");
      d = await create();
    } else {
      setBusy(provider === "supabase" ? "Creating your Supabase database (a minute or two)…" : "Creating your Neon database…");
    }
    setBusy(null);
    if (d.error || d.db?.error) setError(d.error || d.db?.error);
    await load();
    onUpdated();
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
  // Technical output: the newest of the last recorded action and the last check of the current testing copy.
  const ev = s.last_event ?? null;
  const checkEntry = checkedThis && s.check ? { kind: "check" as const, at: s.check.at, what: `Check of ${stage?.release.version ? `v${stage.release.version}` : "the latest version"} on the live testing agent` } : null;
  const evEntry = ev ? { kind: "event" as const, at: ev.at, what: ev.what } : null;
  const newest = checkEntry && evEntry ? (checkEntry.at >= evEntry.at ? checkEntry : evEntry) : checkEntry ?? evEntry;
  // The live testing agent's last check failed: which rules, in plain words.
  const failedCheck = checkedThis && s.check && !s.check.passed ? s.check.gate.filter((g) => !g.ok).map((g) => g.label.replace(/ on the live version| holds/gi, "")).join(", ") : "";
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
            {/* Two ways in: click a column heading to see its steps. */}
            <div className="overflow-hidden rounded-xl border border-edge">
              <div className="grid grid-cols-2 divide-x divide-edge bg-panel text-sm font-semibold">
                {([
                  ["quick", "⚡ Quick start AI (MCPs)"],
                  ["api", "Traditional API setup"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className={`px-3 py-2.5 text-center transition-colors ${dbMode === id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
                    onClick={() => setDbMode(id)}
                    aria-pressed={dbMode === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dbMode === "quick" && (
                <div className="space-y-3 border-t border-edge px-4 py-3">
                  <Steps
                    items={[
                      "Click Start: a sign-in window opens.",
                      `Sign in to ${st.db === "neon" ? "Neon" : "Supabase"} and approve (first time only).`,
                      "AI creates your agent database through the official MCP server and sets it up.",
                    ]}
                  />
                  <button className="btn-primary text-sm" disabled={!!busy} onClick={quickStart}>Start</button>
                </div>
              )}
              {dbMode === "api" && (
                <div className="space-y-3 border-t border-edge px-4 py-3">
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
                </div>
              )}
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
            <Lock open={setupDone} working={!!busy && /Releasing|Checking/.test(busy)} why="Set up the agent database (and login, if needed) above to unlock." />
            <span className="w-52 shrink-0 font-medium text-fg">Deploy agent for testing</span>
            <span className="min-w-0 flex-1">
              {busy && /Releasing|Checking/.test(busy) ? (
                <span className="text-muted">{busy}</span>
              ) : setupDone && stage ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <TestDeployButton label="🧪 Redeploy" disabled={!!busy || !st.hostConnected} onClick={() => post("release", {}, "Releasing a test copy (a few minutes)…")} />
                  {targetLink(stage.target) ? (
                    <a className="text-accent underline" href={targetLink(stage.target)!} target="_blank" rel="noreferrer">Live testing agent ↗</a>
                  ) : (
                    <span className="text-fg/90">Released ({stage.release.id})</span>
                  )}
                </span>
              ) : (
                <TestDeployButton label="🧪 Deploy" disabled={!setupDone || !!busy || !st.hostConnected} onClick={() => post("release", {}, "Releasing a test copy (a few minutes)…")} />
              )}
            </span>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <Lock
              open={done.check || done.live}
              working={!!busy && /Going live|Rolling back/.test(busy)}
              why={
                !setupDone
                  ? "Set up the agent database (and login, if needed) above first."
                  : checkedThis && s.check?.inconclusive
                    ? `The last check couldn't score the testing copy: ${s.check.inconclusive}`
                    : checkedThis && s.check && !s.check.passed
                    ? "The testing copy failed its checks: fix them in Evaluations, then check again."
                    : "Unlocks once the agent is deployed for testing and passes its checks."
              }
            />
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
          </div>
        </div>
        {busy && !/Releasing|Checking|Going live|Rolling back/.test(busy) && <StageLoading text={busy} size="sm" />}
      </DocSection>


      {(ev || checkedThis || s.history.length > 0) && (
        <section className="mt-10 border-t border-edge pt-8">
          {(ev || checkedThis || busy) && (
            <div className="mb-12">
              <WatchHeading>Technical output</WatchHeading>
              <div className="mt-3 rounded-lg border border-edge bg-ink p-3 font-mono text-[12px] leading-relaxed">
                <p className="mb-1 text-[11px] text-muted"># A plain-language explanation of what went wrong and who needs to fix it.</p>
                {busy && <p className="mb-2 flex items-center gap-2 text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{busy}</p>}
                {newest && (
                  <p className="mb-2 border-b border-edge pb-2 text-[11px] text-muted">
                    $ most recent · {newest.what} · {new Date(newest.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                {newest?.kind === "check" &&
                  (s.check!.inconclusive ? (
                    <p className="text-warn">
                      <span className="font-semibold">You need to: </span>
                      {s.check!.inconclusive} <span className="text-muted">(The agent wasn't at fault: its answers couldn't be graded, so this check doesn't count.)</span>
                    </p>
                  ) : s.check!.passed ? (
                    <p className="text-ok">✓ Success: the live testing agent passed its checks. Nothing to fix; it's ready to go live.</p>
                  ) : (
                    <p className="text-fg">
                      <span className="font-semibold text-bad">Live testing agent: </span>
                      failed its checks ({failedCheck}). Fix it in Evaluations; the next release is checked automatically.
                    </p>
                  ))}
                {newest?.kind === "event" &&
                  (ev!.ok ? (
                    <p className="text-ok">✓ Success: {ev!.what} finished. Nothing to fix.</p>
                  ) : ev!.plain ? (
                    <p className={ev!.plain.who === "you" ? "text-warn" : ev!.plain.who === "agent" ? "text-fg" : "text-accent"}>
                      <span className="font-semibold">{ev!.plain.who === "you" ? "You need to: " : ev!.plain.who === "agent" ? "Agent code: " : "Pipeline issue (not something you did): "}</span>
                      {ev!.plain.line}
                    </p>
                  ) : (
                    <p className="text-bad">{ev!.error ?? "That step failed."}</p>
                  ))}
                {newest?.kind === "event" && !ev!.ok && ev!.log && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-muted">Show raw output</summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-fg/70">{ev!.log}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
          {s.history.length > 0 && (
            <div>
              <WatchHeading>Release history</WatchHeading>
              <p className="mb-4 mt-1 text-xs text-muted">A list of all versions released. ↻ lets you quickly restore a previous version that passed its checks.</p>
              <ReleaseTable
                history={s.history}
                notes={st.notes ?? {}}
                passed={(id) => s.checks?.[id] === true || (s.check?.release === id && s.check.passed) || s.history.some((h) => h.id === id && h.env === "production" && h.ok)}
                liveId={live?.release.id}
                busy={!!busy}
                onRedeploy={(id) => post("promote", { action: "promote", release: id }, "Going live…")}
              />
            </div>
          )}
        </section>
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
