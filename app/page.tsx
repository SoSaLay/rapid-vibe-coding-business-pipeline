"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IdeaCapture } from "@/components/IdeaCapture";
import { PhaseRail } from "@/components/PhaseRail";

interface Project {
  id: string;
  title: string;
  created_at: string;
  current_phase: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ideas");
    const data = await res.json();
    setProjects(data.projects || []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Rapid Vibe Coding Pipeline</h1>
        <p className="text-sm text-muted">From a spoken idea to a shipped, marketed product — one phase at a time.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Phase 1 · Business Owner</h2>
            <IdeaCapture onCreated={refresh} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
              Captured ideas ({projects.length})
            </h2>
            <div className="space-y-2">
              {projects.length === 0 && (
                <div className="card p-6 text-center text-sm text-muted">
                  No ideas yet. Speak one, type one, or pull one from Notion to start the pipeline.
                </div>
              )}
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/project/${p.id}`}
                  className="card flex items-center justify-between p-4 hover:border-accent transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{p.title}</div>
                    <div className="text-xs text-muted">
                      {new Date(p.created_at).toLocaleString()} · at {p.current_phase}
                    </div>
                  </div>
                  <span className="rounded-full bg-edge px-3 py-1 text-xs text-muted">Open →</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside>
          <PhaseRail activeId="business-owner" />
        </aside>
      </div>
    </main>
  );
}
