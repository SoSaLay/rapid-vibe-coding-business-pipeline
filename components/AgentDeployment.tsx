"use client";

import { useEffect, useRef, useState } from "react";
import type { DeployState } from "@/lib/agent/deploy";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StageStart } from "./StageStart";

interface Status {
  state: DeployState;
  host: "agentcore" | "railway";
  login: string;
  hostConnected: boolean;
  hasDatabaseUrl: boolean;
  neonConnected: boolean;
  hasJwks: boolean;
  prepared: boolean;
  workspace: string;
}

const HOST_LABEL = { agentcore: "Amazon Bedrock AgentCore", railway: "Railway" };
const LOGIN_LABEL: Record<string, string> = {
  "machine-key": "No login (machine key only)",
  "supabase-auth": "Supabase Auth",
  "neon-auth": "Neon Auth",
  clerk: "Clerk",
};

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-ok text-onbright" : "bg-edge text-muted"}`}>
          {done ? "✓" : n}
        </span>
        <span className="text-sm font-semibold text-fg">{title}</span>
      </div>
      <div className="mt-3 space-y-2 pl-9 text-sm">{children}</div>
    </div>
  );
}

/** Agent pipeline — stage 6. Package → database → login → staging → live check → approve → production (+ rollback). */
export function AgentDeployment({
  projectId,
  hasEvals,
  completed,
  autostart = false,
  onUpdated,
}: {
  projectId: string;
  hasEvals: boolean;
  completed: boolean;
  autostart?: boolean;
  onUpdated: () => void;
}) {
  const autoRan = useRef(false);
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

  return (
    <Doc>
      <DocSection title="Where it runs">
        <DocFacts
          items={[
            { label: "Host", value: `${HOST_LABEL[st.host]} ${st.hostConnected ? "· connected" : "· not connected yet (add it in the toolbox)"}` },
            { label: "Who can use it", value: LOGIN_LABEL[st.login] ?? st.login },
            { label: "Production", value: live ? `Release ${live.release.id}${live.target.url ? ` · ${live.target.url}` : ""}` : "Not live yet" },
          ]}
        />
        <DocMuted>Change the host on Agent Design → Hosting &amp; monthly cost. Changing it never requires rebuilding the agent.</DocMuted>
      </DocSection>

      <DocSection title="Release steps">
        <div className="space-y-3">
          <Step n={1} done={st.prepared && !!s.prepared_at} title="Package the agent">
            <DocMuted>
              Adds the server, the database layer, login, redaction, the kill switch, a Dockerfile, a runbook, and GitHub workflows to
              your agent&apos;s repo. You don&apos;t need Docker installed: {railway ? "Railway" : "AWS"} builds it.
            </DocMuted>
            <button className="btn-ghost" disabled={!!busy} onClick={() => post("prepare", {}, "Packaging (first time installs a few packages)…")}>
              {s.prepared_at ? "Re-package" : "Package →"}
            </button>
          </Step>

          <Step n={2} done={!!s.db?.ok} title="State database">
            <DocMuted>
              It holds conversations, memory, pending approvals, the kill switch and the run log.
            </DocMuted>
            {!s.db?.ok && (
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary" disabled={!!busy || !st.neonConnected} onClick={() => post("database", { create: "neon" }, "Creating a free Neon database…")}>
                  Create a database for me
                </button>
                <span className="text-xs text-muted">
                  {st.neonConnected ? "Free Neon database, set up automatically." : "Add a Neon API key in onboarding to do this in one click."}
                </span>
              </div>
            )}
            <DocMuted>Or paste a connection string you already have (Supabase → Connect → Session pooler, or Neon → Connection string):</DocMuted>
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
                className="btn-ghost"
                disabled={!!busy || (!dbUrl && !st.hasDatabaseUrl)}
                onClick={async () => {
                  if (dbUrl) await post("settings", { databaseUrl: dbUrl }, "Saving…");
                  setDbUrl("");
                  await post("database", {}, "Creating tables…");
                }}
              >
                {s.db?.ok ? "Re-run setup" : "Save & set up"}
              </button>
            </div>
          </Step>

          {(needsJwks || railway) && (
            <Step n={3} done={(!needsJwks || st.hasJwks) && (!railway || !!urls.production)} title={railway ? "Login & addresses" : "Login"}>
              {needsJwks && (
                <>
                  <DocMuted>Paste your login provider&apos;s public key address (JWKS URL), so the agent can check login tokens.</DocMuted>
                  <div className="flex flex-wrap gap-2">
                    <input className="input h-9 min-w-0 flex-1" placeholder={st.hasJwks ? "Saved — paste to replace" : "https://…/.well-known/jwks.json"} value={jwks} onChange={(e) => setJwks(e.target.value)} />
                    <button className="btn-ghost" disabled={!!busy || !jwks} onClick={() => post("settings", { jwksUrl: jwks }, "Saving…").then(() => setJwks(""))}>Save</button>
                  </div>
                </>
              )}
              {railway && (
                <>
                  <DocMuted>Paste your Railway service&apos;s public address (Settings → Networking → Generate domain).</DocMuted>
                  {(["production", "staging"] as const).map((env) => (
                    <div key={env} className="flex flex-wrap items-center gap-2">
                      <span className="w-20 text-xs text-muted">{env}</span>
                      <input
                        className="input h-9 min-w-0 flex-1"
                        placeholder={env === "staging" ? "optional — only with a staging token" : "https://….up.railway.app"}
                        value={urls[env] ?? ""}
                        onChange={(e) => setUrls({ ...urls, [env]: e.target.value })}
                      />
                    </div>
                  ))}
                  <button className="btn-ghost" disabled={!!busy} onClick={() => post("settings", { railwayUrls: urls }, "Saving…")}>Save addresses</button>
                </>
              )}
            </Step>
          )}

          <Step n={4} done={!!stage?.release.ok} title={railway && !s.staging && s.production && !s.history.some((h) => h.env === "staging") ? "Release (no staging environment: goes to production, then checked)" : "Release to staging"}>
            <DocMuted>Ships the current code. Each release is tagged, so you can always return to an earlier one.</DocMuted>
            {stage && <DocFacts items={[{ label: "Latest", value: `${stage.release.id}${stage.release.version ? ` · version ${stage.release.version}` : ""}` }]} />}
            <button className="btn-primary" disabled={!!busy || !s.db?.ok || !st.hostConnected} onClick={() => post("release", {}, "Releasing — building in the cloud takes a few minutes…")}>
              Release →
            </button>
          </Step>

          <Step n={5} done={checkedThis && !!s.check?.passed} title="Check the live version">
            <DocMuted>Runs your test cases against the deployed agent (dry run, test data), so you see the real thing works before anyone uses it.</DocMuted>
            {checkedThis && s.check && (
              <ul className="space-y-1">
                {s.check.gate.map((g) => (
                  <li key={g.label}>
                    <span className={g.ok ? "text-ok" : "text-bad"}>{g.ok ? "✓" : "✗"}</span> {g.label} <span className="text-xs text-muted">— {g.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn-ghost" disabled={!!busy || !stage} onClick={() => post("check", {}, "Running the test cases against the live version…")}>
              Run live check →
            </button>
          </Step>

          <Step n={6} done={!!live && live.release.id === stage?.release.id} title="Approve for production">
            <DocMuted>Your approval is the gate: nothing reaches production without it. Every approval is recorded.</DocMuted>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!!busy || !checkedThis || !s.check?.passed} onClick={() => post("promote", { action: "promote" }, "Promoting to production…")}>
                Approve &amp; go live
              </button>
              <button className="btn-ghost" disabled={!!busy || !canRollback} onClick={() => post("promote", { action: "rollback" }, "Rolling back…")}>
                Roll back to previous release
              </button>
            </div>
            {completed && <p className="text-ok">Live. Operations is unlocked.</p>}
          </Step>
        </div>
        {busy && <p className="mt-3 text-sm text-muted">{busy}</p>}
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

      <DocSection title="Automatic releases (GitHub)">
        <DocP>
          Your agent&apos;s repo already has two workflows. <code>agent-ci</code> runs the tests and evals on every pull request and
          releases <code>main</code> to staging. <code>agent-ops</code> checks for alerts every hour and scores production runs daily.
        </DocP>
        <DocMuted>
          To turn them on, push the repo to GitHub and add these secrets: ANTHROPIC_API_KEY, DATABASE_URL,{" "}
          {railway ? "RAILWAY_TOKEN_STAGING" : "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (and the AWS_REGION variable)"}. Then add a
          &quot;production&quot; environment with yourself as the required reviewer. Repo folder: <code className="break-all">{st.workspace}</code>
        </DocMuted>
      </DocSection>
    </Doc>
  );
}
