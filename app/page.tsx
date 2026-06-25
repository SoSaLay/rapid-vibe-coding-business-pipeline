"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IdeaCapture } from "@/components/IdeaCapture";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingButton, useOnboarding } from "@/components/Onboarding";
import { IDEA_TYPES, getIdeaType } from "@/lib/idea-types";

interface Project {
  id: string;
  title: string;
  created_at: string;
  current_phase: string;
  cycle?: number;
  archived?: boolean;
  idea_type?: string;
  labeled?: boolean;
}

type Tab = "create" | "pipelines";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("create");
  const [showArchived, setShowArchived] = useState(false);
  const { status: onboarding, reload: reloadOnboarding } = useOnboarding();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ideas");
    const data = await res.json();
    setProjects(data.projects || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  async function setArchived(id: string, value: boolean) {
    await fetch(`/api/projects/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: value }),
    });
    refresh();
  }

  // After capturing a fresh idea, jump to the pipelines tab where it now lives.
  function onCreated() {
    refresh();
    setTab("pipelines");
  }

  return (
    <main className="paper mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Rapid Vibe Coding Business Pipeline</h1>
          <p className="mt-1 text-sm text-muted">From a spoken idea to a shipped, marketed product — one phase at a time.</p>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <OnboardingButton status={onboarding} reload={reloadOnboarding} highlight={!onboarding?.requiredComplete} />
          <ThemeToggle />
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b border-edge">
        <TabButton active={tab === "create"} onClick={() => setTab("create")}>Create idea</TabButton>
        <TabButton active={tab === "pipelines"} onClick={() => setTab("pipelines")}>
          Launch a pipeline {active.length > 0 && <span className="text-muted">({active.length})</span>}
        </TabButton>
      </div>

      {tab === "create" && <IdeaCapture onCreated={onCreated} />}

      {tab === "pipelines" && (
        <div className="space-y-6">
          <section className="space-y-2">
            {active.length === 0 && (
              <div className="card p-6 text-center text-sm text-muted">
                No ideas yet. Switch to <button className="text-accent2 hover:text-fg" onClick={() => setTab("create")}>Create idea</button> to start one.
              </div>
            )}
            {active.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">
                      {p.title}
                      {(p.cycle ?? 1) > 1 && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">Cycle {p.cycle}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {new Date(p.created_at).toLocaleString()} · at {p.current_phase}
                    </div>
                    <div className="mt-2">
                      <LabelDropdown project={p} onLabeled={refresh} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setArchived(p.id, true)}
                      className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                    >
                      Archive
                    </button>
                    <DeleteIdea id={p.id} title={p.title} onDeleted={refresh} />
                    <Link
                      href={`/project/${p.id}`}
                      className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Start pipeline →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {archived.length > 0 && (
            <section>
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="mb-3 text-sm font-medium uppercase tracking-wider text-muted hover:text-fg"
              >
                Archived ({archived.length}) {showArchived ? "▲" : "▼"}
              </button>
              {showArchived && (
                <div className="space-y-2">
                  {archived.map((p) => (
                    <div key={p.id} className="card flex items-center justify-between p-4 opacity-70">
                      <Link href={`/project/${p.id}`} className="min-w-0">
                        <div className="text-sm font-medium text-fg">{p.title}</div>
                        <div className="text-xs text-muted">{new Date(p.created_at).toLocaleString()} · archived</div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setArchived(p.id, false)}
                          className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                        >
                          Unarchive
                        </button>
                        <DeleteIdea id={p.id} title={p.title} onDeleted={refresh} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
        active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Per-idea type label. Unlabeled ideas show a "Label me" chip; clicking opens a
 * dropdown to pick the idea type, which is saved and propagated to the pipeline.
 */
function LabelDropdown({ project, onLabeled }: { project: Project; onLabeled: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = project.labeled ? getIdeaType(project.idea_type) : undefined;

  async function pick(id: string) {
    setBusy(true);
    await fetch(`/api/projects/${project.id}/label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaType: id }),
    }).catch(() => {});
    setBusy(false);
    setOpen(false);
    onLabeled();
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          current
            ? "border-accent2/40 bg-accent2/10 text-fg"
            : "border-dashed border-muted/50 text-muted hover:border-accent2 hover:text-accent2"
        }`}
      >
        {current ? <>{current.icon} {current.label}</> : <>🏷️ Label me</>}
        <span className="text-[9px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-72 w-60 overflow-auto rounded-lg border border-edge bg-panel p-1 shadow-lg">
          {IDEA_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-edge/50 ${
                project.idea_type === t.id && project.labeled ? "bg-accent2/10" : ""
              }`}
            >
              <span>{t.icon}</span>
              <span>
                <span className="block text-fg">{t.label}</span>
                <span className="block text-[10px] text-muted">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Permanent-delete control with a type-the-name second factor.
 */
function DeleteIdea({ id, title, onDeleted }: { id: string; title: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirm.trim() === title.trim();

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: confirm.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error || "Failed to delete.");
    }
    onDeleted();
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-bad"
      >
        Delete
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-bad/40 bg-panel p-3 text-left shadow-lg">
          <p className="text-xs text-fg">
            Permanently delete this idea and <span className="font-medium">all its data</span>? This can’t be undone.
          </p>
          <p className="mt-2 text-[11px] text-muted">
            Type <span className="font-medium text-fg">{title}</span> to confirm:
          </p>
          <input
            autoFocus
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={title}
            className="input mt-1 text-xs"
          />
          {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => { setOpen(false); setConfirm(""); setError(null); }}
              className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={remove}
              disabled={!matches || busy}
              className="rounded-full bg-bad px-3 py-1 text-xs text-onbright disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
