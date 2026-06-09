"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhaseRail } from "@/components/PhaseRail";
import { ProductOwner } from "@/components/ProductOwner";
import { IdeaValidation } from "@/components/IdeaValidation";
import { PreMarketing } from "@/components/PreMarketing";

interface Artifact {
  artifact_type: string;
  version: number;
  payload: any;
}
interface ProjectData {
  project: { id: string; title: string; current_phase: string; phase_status: Record<string, any> };
  artifacts: Artifact[];
  phaseState: { "product-owner": any };
}

export default function ProjectWorkspace({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ProjectData | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) setData(await res.json());
  }, [params.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!data) return <main className="mx-auto max-w-5xl px-4 py-8 text-muted">Loading…</main>;

  const { project, artifacts, phaseState } = data;
  const rawIdea = artifacts.filter((a) => a.artifact_type === "raw-idea").slice(-1)[0];
  const productSpec = artifacts.filter((a) => a.artifact_type === "product-spec").slice(-1)[0];
  const marketReport = artifacts.filter((a) => a.artifact_type === "market-report").slice(-1)[0];
  const audienceBrief = artifacts.filter((a) => a.artifact_type === "audience-brief").slice(-1)[0];
  const ideaText = rawIdea?.payload?.raw_text || "";
  const current = project.current_phase;
  const showPO = !!productSpec || current === "product-owner" || current === "business-owner";

  const preMkt = (phaseState as any)?.["pre-marketing"] ?? null;
  const preMktState = project.phase_status["pre-marketing"];
  const showPreMkt = !!preMkt?.kit || ["active", "complete", "skipped"].includes(preMktState);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <Link href="/" className="text-xs text-muted hover:text-white">
          ← All ideas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-white">{project.title}</h1>
        <p className="text-sm text-muted">Current phase: {current}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Phase 2 · Product Owner</h2>
            {showPO ? (
              <ProductOwner
                projectId={project.id}
                ideaText={ideaText}
                initialDialogue={phaseState?.["product-owner"] ?? null}
                spec={productSpec?.payload ?? null}
                onUpdated={refresh}
              />
            ) : (
              <div className="card p-6 text-sm text-muted">Locked until the prior phase completes.</div>
            )}
          </section>

          {productSpec && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
                Phase 3 · Market Researcher
              </h2>
              <IdeaValidation
                projectId={project.id}
                hasSpec={!!productSpec}
                report={marketReport?.payload ?? null}
                onUpdated={refresh}
              />
            </section>
          )}

          {showPreMkt && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Phase 4 · Pre-Marketing</h2>
              <PreMarketing
                projectId={project.id}
                hasSpec={!!productSpec}
                kit={preMkt?.kit ?? null}
                frameworks={preMkt?.frameworks ?? null}
                brief={audienceBrief?.payload ?? null}
                onUpdated={refresh}
              />
            </section>
          )}
        </div>

        <aside>
          <PhaseRail activeId={current} status={project.phase_status} />
        </aside>
      </div>
    </main>
  );
}
