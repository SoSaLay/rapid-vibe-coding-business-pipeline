"use client";

import { useCallback, useEffect, useState } from "react";

interface TargetInfo {
  id: string;
  label: string;
  status: string;
  note: string;
}
interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
}
interface DeployPlan {
  summary: string;
  env_vars: EnvVar[];
  human_todos: string[];
  notes: string[];
}
interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}
interface DeployEnvironment {
  name: string;
  branch: string;
  url: string;
  status: string;
  notes?: string;
}
interface DeployResults {
  completed_at: string | null;
  app_id: string | null;
  repo_url: string | null;
  environments: DeployEnvironment[];
  waf: { requested: boolean; enabled: boolean; notes: string };
  domain: { requested: string | null; status: string; notes: string };
  blockers: string[];
}
interface UrlVerification {
  name: string;
  url: string;
  reachable: boolean;
  status: number | null;
  https: boolean;
  headers_found: string[];
  headers_missing: string[];
}
interface DeployManifest {
  target: string;
  environments: DeployEnvironment[];
  verification: UrlVerification[];
  waf: { requested: boolean; enabled: boolean; notes: string } | null;
  domain: { requested: string | null; status: string; notes: string } | null;
  human_todos: string[];
  forced: boolean;
  blockers_at_signoff: string[];
}

const TARGETS: TargetInfo[] = [
  { id: "amplify", label: "AWS Amplify", status: "active", note: "Next.js on Lambda automatically · dev/UAT/prod from git branches · generous free tier" },
  { id: "vercel", label: "Vercel", status: "coming_soon", note: "Zero-config Next.js hosting" },
  { id: "vps", label: "VPS (self-hosted)", status: "coming_soon", note: "Your own server — cheapest at scale" },
];

export function Deployment({
  projectId,
  hasQaReport,
  state,
  manifest,
  onUpdated,
}: {
  projectId: string;
  hasQaReport: boolean;
  state: { plan?: DeployPlan | null; options?: { waf: boolean; domain: string | null }; startCommand?: string } | null;
  manifest: DeployManifest | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: any): Promise<any | null> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/deployment/${path}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Request failed.");
      return null;
    }
    onUpdated();
    return d;
  }

  if (!hasQaReport) {
    return <div className="card p-6 text-sm text-muted">Locked until QA signs off.</div>;
  }
  if (manifest) return <ManifestView manifest={manifest} />;

  const plan = state?.plan ?? null;
  if (!plan) return <OptionsPanel busy={busy} error={error} onGenerate={(opts) => post("plan", opts)} />;

  return (
    <DeployRunView
      projectId={projectId}
      plan={plan}
      options={state?.options ?? { waf: false, domain: null }}
      startCommand={state?.startCommand ?? ""}
      busy={busy}
      error={error}
      post={post}
    />
  );
}

/* ---------------- Shared bits ---------------- */

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Copyable({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-accent2 hover:text-fg"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "copied ✓" : label || "copy"}
    </button>
  );
}

function Light({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-ok" : "bg-bad"}`} />;
}

/* ---------------- Options → generate plan ---------------- */

function OptionsPanel({
  busy,
  error,
  onGenerate,
}: {
  busy: boolean;
  error: string | null;
  onGenerate: (opts: { target: string; waf: boolean; domain: string | null }) => void;
}) {
  const [target, setTarget] = useState("amplify");
  const [waf, setWaf] = useState(false);
  const [domain, setDomain] = useState("");

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm text-muted">
        The release engineer plans the deployment: three environments (dev / UAT / prod) from git branches, the full
        env-var inventory, and a runbook your coding agent executes end-to-end. You paste one command.
      </p>

      <div>
        <div className="text-xs font-medium text-fg mb-1.5">Hosting target</div>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {TARGETS.map((t) => {
            const soon = t.status === "coming_soon";
            const selected = target === t.id;
            return (
              <button
                key={t.id}
                disabled={soon}
                onClick={() => setTarget(t.id)}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  selected ? "border-accent2 bg-accent2/10" : "border-edge hover:bg-edge/30"
                } ${soon ? "opacity-40" : ""}`}
              >
                <div className="text-xs text-fg">
                  {t.label}
                  {t.id === "amplify" && <span className="ml-1 text-[10px] text-muted">(default)</span>}
                  {soon && <span className="ml-1 text-[10px] text-muted">(coming soon)</span>}
                </div>
                <div className="mt-0.5 text-[10px] text-muted">{t.note}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-edge p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={waf} onChange={(e) => setWaf(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="text-xs text-fg">Add AWS WAF (web application firewall)</span>
            <span className="block text-[11px] text-muted">
              A managed bouncer in front of the app: blocks attack patterns, bad bots, and request floods before your
              code runs. Costs ~$5–10/month — worth it once an app has real users; skip for experiments. The app-level
              rate limiting from the build is always on either way.
            </span>
          </span>
        </label>
      </div>

      <div>
        <div className="text-xs font-medium text-fg mb-1">Custom domain (optional)</div>
        <input
          className="w-full rounded bg-ink px-3 py-2 text-xs text-fg placeholder:text-muted/60 border border-edge"
          placeholder="myapp.com — leave empty for the free amplifyapp.com URL"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <p className="mt-1 text-[10px] text-muted">
          Must already be in Route 53 (bought there, or DNS moved there). Domains cost real money — your call.
        </p>
      </div>

      <div className="flex justify-center">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => onGenerate({ target, waf, domain: domain.trim() || null })}
        >
          {busy ? "Planning the deployment…" : "Generate deploy plan"}
        </button>
      </div>
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

/* ---------------- The deploy run (plan → preflight → run → sign-off) ---------------- */

function DeployRunView({
  projectId,
  plan,
  options,
  startCommand,
  busy,
  error,
  post,
}: {
  projectId: string;
  plan: DeployPlan;
  options: { waf: boolean; domain: string | null };
  startCommand: string;
  busy: boolean;
  error: string | null;
  post: (path: string, body?: any) => Promise<any | null>;
}) {
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [results, setResults] = useState<DeployResults | null>(null);
  const [verifications, setVerifications] = useState<UrlVerification[]>([]);
  const [exit, setExit] = useState<{ ready: boolean; blockers: string[] } | null>(null);
  const [commits, setCommits] = useState<string[]>([]);

  const preflight = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/deployment/preflight`);
    if (res.ok) setChecks((await res.json()).checks);
  }, [projectId]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/deployment/progress`);
    if (!res.ok) return;
    const d = await res.json();
    setResults(d.results);
    setVerifications(d.verifications || []);
    setExit(d.exit || null);
    setCommits(d.commits || []);
  }, [projectId]);

  useEffect(() => {
    preflight();
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [preflight, refresh]);

  const allChecksOk = !!checks && checks.every((c) => c.ok);

  return (
    <div className="space-y-4">
      <Section title="Deploy plan">
        <p className="text-sm text-fg/90">{plan.summary}</p>
        <p className="mt-2 text-xs text-muted">
          AWS Amplify · 3 environments (dev / UAT / prod) · WAF {options.waf ? "on" : "off"} · domain{" "}
          {options.domain || "free amplifyapp.com URL"}
        </p>
        {plan.notes.length > 0 && (
          <ul className="mt-2 list-disc ml-5 space-y-0.5 text-[11px] text-fg/80">
            {plan.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Environment variables (${plan.env_vars.length})`}>
        <div className="space-y-1">
          {plan.env_vars.map((v) => (
            <p key={v.name} className="text-[11px] text-fg/85">
              <span className="font-mono text-accent2">{v.name}</span>
              {v.secret && <span className="ml-1 rounded bg-warn/20 px-1 text-[9px] text-warn">secret</span>}
              {!v.required && <span className="ml-1 text-[10px] text-muted">(optional)</span>}
              <span className="text-muted"> — {v.description}</span>
            </p>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Values are read from the app's .env.local by the agent and set on the host — they never pass through this
          dashboard.
        </p>
      </Section>

      {plan.human_todos.length > 0 && (
        <Section title="Your to-dos (the agent can't do these)">
          <ul className="space-y-1">
            {plan.human_todos.map((t, i) => (
              <li key={i} className="text-xs text-fg/85">
                ☐ {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Preflight"
        action={
          <button className="text-[11px] text-accent2 hover:text-fg" onClick={preflight}>
            re-check
          </button>
        }
      >
        {!checks ? (
          <p className="text-xs text-muted">Checking your machine…</p>
        ) : (
          <div className="space-y-1.5">
            {checks.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <Light ok={c.ok} />
                <div className="-mt-0.5">
                  <span className="text-xs text-fg">{c.label}</span>
                  <span className="ml-2 text-[11px] text-muted">{c.detail}</span>
                  {!c.ok && c.fix && <p className="text-[11px] text-warn">→ {c.fix}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Run the deployment" action={<Copyable text={startCommand} label="copy command" />}>
        <p className="text-xs text-muted mb-2">
          {allChecksOk
            ? "Preflight green. Paste this in a terminal — the agent pushes to GitHub, creates the Amplify app, wires all three environments, sets env vars, and reports back here."
            : "Fix the red preflight items first, then paste this in a terminal."}
        </p>
        <pre className="rounded bg-ink p-2.5 text-xs text-fg/90 overflow-x-auto">{startCommand}</pre>
      </Section>

      <Section
        title="Deploy progress"
        action={
          <button className="text-[11px] text-accent2 hover:text-fg" onClick={refresh}>
            refresh
          </button>
        }
      >
        {!results ? (
          <p className="text-xs text-muted">Waiting for the agent to write deploy/results.json… (polls every 20s)</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {results.environments.map((e) => {
                const v = verifications.find((x) => x.name === e.name);
                return (
                  <div key={e.name} className="flex items-center justify-between">
                    <span className="text-xs text-fg">
                      {e.name} <span className="text-muted">({e.branch})</span>
                      {e.url && (
                        <a className="ml-2 text-accent2 hover:underline" href={e.url.startsWith("http") ? e.url : `https://${e.url}`} target="_blank" rel="noreferrer">
                          open ↗
                        </a>
                      )}
                    </span>
                    <span className={`text-[11px] ${e.status === "live" ? "text-ok" : e.status === "failed" ? "text-bad" : "text-warn"}`}>
                      {e.status}
                      {v && v.reachable && ` · HTTP ${v.status} · ${v.headers_found.length}/5 headers`}
                    </span>
                  </div>
                );
              })}
            </div>
            {results.waf.requested && (
              <p className="mt-2 text-[11px] text-muted">
                WAF: {results.waf.enabled ? "✓ attached" : "requested — " + (results.waf.notes || "pending")}
              </p>
            )}
            {results.domain.requested && (
              <p className="text-[11px] text-muted">
                Domain {results.domain.requested}: {results.domain.status}
                {results.domain.notes ? ` — ${results.domain.notes}` : ""}
              </p>
            )}
            {results.blockers.map((b, i) => (
              <p key={i} className="mt-1 text-[11px] text-warn">
                ⚠ {b}
              </p>
            ))}
          </>
        )}
        {commits.length > 0 && (
          <div className="mt-3 rounded bg-ink/60 p-2">
            {commits.map((c, i) => (
              <p key={i} className="text-[10px] text-muted font-mono truncate">
                {c}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sign-off">
        {exit?.ready ? (
          <p className="text-xs text-ok mb-2">Prod is live and verified. Sign off to unlock Marketing & Sales.</p>
        ) : (
          <ul className="mb-2 space-y-0.5">
            {(exit?.blockers ?? ["Evaluating…"]).map((b, i) => (
              <li key={i} className="text-[11px] text-warn">
                · {b}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !exit?.ready} onClick={() => post("complete")}>
            {busy ? "Signing off…" : "Sign off → unlock Marketing"}
          </button>
          {exit && !exit.ready && (
            <button className="btn-ghost" disabled={busy} onClick={() => post("complete", { force: true })}>
              Sign off anyway
            </button>
          )}
        </div>
      </Section>

      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

/* ---------------- Signed-off manifest ---------------- */

function ManifestView({ manifest }: { manifest: DeployManifest }) {
  const prod = manifest.environments.find((e) => e.name === "prod");
  return (
    <div className="space-y-4">
      <div className={`card p-4 border ${manifest.forced ? "border-warn/30" : "border-ok/30"}`}>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${manifest.forced ? "bg-warn" : "bg-ok"} text-onbright`}>
          {manifest.forced ? "deployed with warnings" : "live"}
        </span>
        {prod?.url && (
          <a
            className="ml-3 text-xs text-accent2 hover:underline"
            href={prod.url.startsWith("http") ? prod.url : `https://${prod.url}`}
            target="_blank"
            rel="noreferrer"
          >
            {prod.url} ↗
          </a>
        )}
      </div>

      {manifest.forced && manifest.blockers_at_signoff.length > 0 && (
        <Section title="Signed off with open blockers">
          <ul className="space-y-0.5">
            {manifest.blockers_at_signoff.map((b, i) => (
              <li key={i} className="text-[11px] text-warn">
                · {b}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Environments">
        <div className="space-y-1.5">
          {manifest.environments.map((e) => {
            const v = manifest.verification.find((x) => x.name === e.name);
            return (
              <div key={e.name} className="flex items-center justify-between">
                <span className="text-xs text-fg">
                  {e.name} <span className="text-muted">({e.branch})</span>
                  {e.url && (
                    <a className="ml-2 text-accent2 hover:underline" href={e.url.startsWith("http") ? e.url : `https://${e.url}`} target="_blank" rel="noreferrer">
                      open ↗
                    </a>
                  )}
                </span>
                <span className="text-[11px] text-muted">
                  {e.status}
                  {v && v.reachable && ` · HTTP ${v.status} · headers ${v.headers_found.length}/5`}
                </span>
              </div>
            );
          })}
        </div>
        {manifest.verification.some((v) => v.headers_missing.length > 0) && (
          <p className="mt-2 text-[11px] text-warn">
            Missing security headers in prod:{" "}
            {manifest.verification.find((v) => v.name === "prod")?.headers_missing.join(", ") || "—"}
          </p>
        )}
      </Section>

      {(manifest.waf?.requested || manifest.domain?.requested) && (
        <Section title="Extras">
          {manifest.waf?.requested && (
            <p className="text-xs text-fg/85">
              WAF: {manifest.waf.enabled ? "✓ attached" : `requested — ${manifest.waf.notes || "pending"}`}
            </p>
          )}
          {manifest.domain?.requested && (
            <p className="text-xs text-fg/85">
              Domain {manifest.domain.requested}: {manifest.domain.status}
            </p>
          )}
        </Section>
      )}

      {manifest.human_todos.length > 0 && (
        <Section title="Outstanding to-dos">
          <ul className="space-y-1">
            {manifest.human_todos.map((t, i) => (
              <li key={i} className="text-xs text-fg/85">
                ☐ {t}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
