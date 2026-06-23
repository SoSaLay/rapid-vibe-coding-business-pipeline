"use client";

import { useCallback, useEffect, useState } from "react";
import { STACK_SLOTS, StackChoice } from "@/lib/stack";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";

interface Proposal {
  choices: StackChoice[];
  architecture_summary: string;
  mermaid_diagram: string;
  key_decisions: string[];
}

interface Workspace {
  path: string;
  startCommand: string;
  gitInitialized: boolean;
}

interface Progress {
  total: number;
  done: number;
  current: string | null;
  milestones: { name: string; total: number; done: number }[];
}

interface BuildManifest {
  workspace_path: string;
  tasks_done: number;
  tasks_total: number;
  forced: boolean;
  launch_guide: string;
  imported?: boolean;
  repo_url?: string;
}

export function Engineering({
  projectId,
  hasSpec,
  state,
  manifest,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  state: { proposal?: Proposal | null; stack?: StackChoice[] | null; workspace?: Workspace | null } | null;
  manifest: BuildManifest | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopper = useStopper();

  async function post(path: string, body?: any) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/engineering/${path}`, {
        method: "POST",
        signal: stopper.signal(),
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(d.error || "Request failed.");
        return false;
      }
      onUpdated();
      return true;
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Request failed.");
      return false;
    }
  }

  if (!hasSpec) return <div className="card p-6 text-sm text-muted">Locked until the product spec is complete.</div>;

  const proposal = state?.proposal ?? null;
  const stack = state?.stack ?? null;
  const workspace = state?.workspace ?? null;

  if (manifest) {
    return (
      <div className="space-y-4">
        <div className="card p-4 border border-ok/30">
          <span className="rounded-full bg-ok px-3 py-1 text-sm font-semibold text-onbright">
            {manifest.imported ? "imported repository" : "build complete"}
          </span>
          <span className="ml-3 text-xs text-muted">
            {manifest.imported
              ? "Existing codebase cloned to your workspace — iterate on it directly or run the rest of the pipeline · QA unlocked"
              : `${manifest.tasks_done}/${manifest.tasks_total} tasks${manifest.forced ? " (completed manually)" : ""} · QA unlocked`}
          </span>
        </div>
        <LaunchGuideView guide={manifest.launch_guide} path={manifest.workspace_path} />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="card p-6 space-y-4">
        <p className="text-sm text-muted text-center">
          The architect reads your product spec and design spec, proposes a tech stack built on the studio defaults
          (Next.js · Supabase · shadcn/ui), and draws the system architecture. You can change any slot before the build
          starts.
        </p>
        <Interject projectId={projectId} phase="engineering" />
        <div className="flex items-center justify-center gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => post("propose")}>
            {busy ? "Designing the system…" : "Run the architect"}
          </button>
          {busy && <StopButton onStop={stopper.stop} />}
        </div>
        {error && <p className="text-sm text-bad text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StackView
        proposal={proposal}
        approvedStack={stack}
        busy={busy}
        onApprove={(choices) => post("approve", { choices })}
        onRerun={() => post("propose")}
      />
      {stack && !workspace && <ScaffoldPanel busy={busy} onScaffold={() => post("scaffold")} />}
      {workspace && <BuildPanel projectId={projectId} workspace={workspace} busy={busy} post={post} />}
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

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

/* ---------------- Stack proposal + selector ---------------- */

function StackView({
  proposal,
  approvedStack,
  busy,
  onApprove,
  onRerun,
}: {
  proposal: Proposal;
  approvedStack: StackChoice[] | null;
  busy: boolean;
  onApprove: (choices: StackChoice[]) => void;
  onRerun: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const base = approvedStack || proposal.choices;
  const [choices, setChoices] = useState<Record<string, string>>(
    Object.fromEntries(base.map((c) => [c.slot, c.choice]))
  );
  const approved = !!approvedStack;

  function setChoice(slot: string, choice: string) {
    setChoices((p) => ({ ...p, [slot]: choice }));
  }

  function buildChoices(): StackChoice[] {
    return STACK_SLOTS.map((slot) => {
      const fromProposal = proposal.choices.find((c) => c.slot === slot.id);
      const choice = choices[slot.id] ?? slot.default;
      return {
        slot: slot.id,
        choice,
        rationale:
          choice === fromProposal?.choice ? fromProposal.rationale : "Selected by you in the tech-stack selector.",
      };
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-ok">
            {approved ? "Tech stack — approved" : "Proposed tech stack"}
          </div>
          {!approved && (
            <button className="btn-ghost" disabled={busy} onClick={onRerun}>
              {busy ? "…" : "Re-run architect"}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-fg/90">{proposal.architecture_summary}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {STACK_SLOTS.map((slot) => {
            const choiceId = choices[slot.id] ?? slot.default;
            const opt = slot.options.find((o) => o.id === choiceId);
            const isDefault = choiceId === slot.default;
            const rationale = proposal.choices.find((c) => c.slot === slot.id && c.choice === choiceId)?.rationale;
            return (
              <div key={slot.id} className="rounded-lg border border-edge p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">{slot.label}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{opt?.label}</span>
                  {isDefault ? (
                    <span className="rounded-full bg-edge/60 px-2 py-0.5 text-[10px] text-muted">default</span>
                  ) : (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] text-warn">deviation</span>
                  )}
                </div>
                {rationale && <p className="mt-1 text-[11px] text-muted">{rationale}</p>}
                {!isDefault && opt?.warning && <p className="mt-1 text-[11px] text-warn">⚠ {opt.warning}</p>}
              </div>
            );
          })}
        </div>

        {proposal.key_decisions.length > 0 && (
          <ul className="mt-4 list-disc ml-5 space-y-0.5 text-xs text-fg/80">
            {proposal.key_decisions.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        )}

        {!approved && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-ghost" onClick={() => setEditing((e) => !e)}>
              {editing ? "Hide selector" : "Change tech stack"}
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => onApprove(buildChoices())}>
              {busy ? "Saving…" : "Approve stack →"}
            </button>
          </div>
        )}
      </div>

      {editing && !approved && (
        <Section title="Tech-stack selector">
          <div className="space-y-4">
            {STACK_SLOTS.map((slot) => (
              <div key={slot.id}>
                <div className="text-xs font-medium text-fg mb-1.5">{slot.label}</div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {slot.options.map((o) => {
                    const selected = (choices[slot.id] ?? slot.default) === o.id;
                    const soon = o.status === "coming_soon";
                    return (
                      <button
                        key={o.id}
                        disabled={soon}
                        onClick={() => setChoice(slot.id, o.id)}
                        className={`rounded-lg border p-2.5 text-left transition-colors ${
                          selected ? "border-accent2 bg-accent2/10" : "border-edge hover:bg-edge/30"
                        } ${soon ? "opacity-40" : ""}`}
                      >
                        <div className="text-xs text-fg">
                          {o.label}
                          {o.id === slot.default && <span className="ml-1 text-[10px] text-muted">(default)</span>}
                          {soon && <span className="ml-1 text-[10px] text-muted">(coming soon)</span>}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted">{o.note}</div>
                        {o.warning && <div className="mt-0.5 text-[10px] text-warn">⚠ {o.warning}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ---------------- Scaffold (workspace creation) ---------------- */

function ScaffoldPanel({ busy, onScaffold }: { busy: boolean; onScaffold: () => void }) {
  return (
    <Section title="Create the app workspace">
      <div className="rounded-lg border border-accent2/30 bg-accent2/5 p-3 mb-3">
        <p className="text-xs text-fg/85">
          ℹ️ Heads up: this creates a folder on your computer at{" "}
          <span className="text-accent2 font-medium">~/Rapid Vibe Coding Apps/</span> — the home for every application
          this pipeline builds. Inside it, this project gets its own folder with the full build briefing: the specs,
          the design tokens, and the task tracker your coding agent works from.
        </p>
      </div>
      <p className="text-xs text-muted mb-3">
        Generates the milestone/task graph (a minute or two), then writes the briefing package and initializes git.
      </p>
      <button className="btn-primary" disabled={busy} onClick={onScaffold}>
        {busy ? "Generating task graph…" : "Create workspace & task graph"}
      </button>
    </Section>
  );
}

/* ---------------- Build monitor ---------------- */

function BuildPanel({
  projectId,
  workspace,
  busy,
  post,
}: {
  projectId: string;
  workspace: Workspace;
  busy: boolean;
  post: (path: string, body?: any) => Promise<boolean>;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [commits, setCommits] = useState<string[]>([]);
  const [gsd, setGsd] = useState<string | null>(null);
  const [guideReady, setGuideReady] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/engineering/progress`);
    if (!res.ok) return;
    const d = await res.json();
    setProgress(d.progress);
    setCommits(d.commits || []);
    setGsd(d.gsd?.detected ? d.gsd.summary : null);
    setGuideReady(!!d.launchGuideReady);
  }, [projectId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const allDone = !!progress && progress.total > 0 && progress.done === progress.total;

  return (
    <>
      <Section title="Start the build" action={<Copyable text={workspace.startCommand} label="copy command" />}>
        <p className="text-xs text-muted mb-2">
          Open a terminal, paste this, and your coding agent takes it from there — it reads the briefing and works
          through the task list. You never write code; just answer its occasional questions.
        </p>
        <pre className="rounded bg-ink p-2.5 text-xs text-fg/90 overflow-x-auto">{workspace.startCommand}</pre>
        <p className="mt-2 text-[11px] text-muted">
          Recommended power-up (one-time install): <span className="text-fg/70">npx get-shit-done-cc@latest</span>{" "}
          <Copyable text="npx get-shit-done-cc@latest" /> — then run <span className="text-fg/70">/gsd:import --from TASKS.md</span>{" "}
          inside Claude Code for fresh-context-per-task execution.
        </p>
      </Section>

      <Section
        title="Build progress"
        action={
          <button className="text-[11px] text-accent2 hover:text-fg" onClick={refresh}>
            refresh
          </button>
        }
      >
        {!progress ? (
          <p className="text-xs text-muted">Reading the workspace…</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-edge/50">
                <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-fg whitespace-nowrap">
                {progress.done}/{progress.total} · {pct}%
              </span>
            </div>
            {progress.current && (
              <p className="mt-2 text-xs text-muted">
                <span className="text-accent2">Up next:</span> {progress.current}
              </p>
            )}
            <div className="mt-3 space-y-1">
              {progress.milestones.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className={m.done === m.total && m.total > 0 ? "text-ok" : "text-fg/80"}>
                    {m.done === m.total && m.total > 0 ? "✓ " : ""}
                    {m.name}
                  </span>
                  <span className="text-muted">
                    {m.done}/{m.total}
                  </span>
                </div>
              ))}
            </div>
            {gsd && <p className="mt-2 text-[11px] text-accent2">{gsd}</p>}
            {commits.length > 0 && (
              <div className="mt-3 rounded bg-ink/60 p-2">
                {commits.map((c, i) => (
                  <p key={i} className="text-[10px] text-muted font-mono truncate">
                    {c}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Finish">
        <p className="text-xs text-muted mb-2">
          {allDone
            ? `All tasks complete${guideReady ? " and the Launch Guide is written" : ""}. Lock it in to unlock QA.`
            : "Enabled when every task is checked off. (Or complete manually if you stopped the build early.)"}
        </p>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !allDone} onClick={() => post("complete")}>
            {busy ? "Finishing…" : "Complete build → unlock QA"}
          </button>
          {!allDone && progress && progress.done > 0 && (
            <button className="btn-ghost" disabled={busy} onClick={() => post("complete", { force: true })}>
              Complete anyway
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

/* ---------------- Launch guide ---------------- */

function LaunchGuideView({ guide, path }: { guide: string; path: string }) {
  return (
    <Section title="Launch guide" action={<Copyable text={guide} label="copy guide" />}>
      <p className="text-xs text-muted mb-2">
        Your app lives at <span className="text-accent2">{path}</span>. This guide (also saved there as
        LAUNCH-GUIDE.md) walks through keys, running locally, and what to verify.
      </p>
      <pre className="whitespace-pre-wrap rounded bg-ink p-3 text-xs text-fg/85 max-h-[32rem] overflow-y-auto">{guide}</pre>
    </Section>
  );
}
