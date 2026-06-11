"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhaseRail } from "@/components/PhaseRail";
import { ProductOwner } from "@/components/ProductOwner";
import { IdeaValidation } from "@/components/IdeaValidation";
import { PreMarketing } from "@/components/PreMarketing";
import { ProductDesign } from "@/components/ProductDesign";
import { Engineering } from "@/components/Engineering";
import { QA } from "@/components/QA";
import { Deployment } from "@/components/Deployment";
import { PHASES } from "@/lib/pipeline";

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
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
      // Auto-select the current active phase on first load
      setSelectedPhase((prev) => prev ?? d.project.current_phase);
    }
  }, [params.id]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!data) return <main className="mx-auto max-w-5xl px-4 py-8 text-muted">Loading…</main>;

  const { project, artifacts, phaseState } = data;
  const rawIdea = artifacts.filter((a) => a.artifact_type === "raw-idea").slice(-1)[0];
  const productSpec = artifacts.filter((a) => a.artifact_type === "product-spec").slice(-1)[0];
  const marketReport = artifacts.filter((a) => a.artifact_type === "market-report").slice(-1)[0];
  const audienceBrief = artifacts.filter((a) => a.artifact_type === "audience-brief").slice(-1)[0];
  const designSpec = artifacts.filter((a) => a.artifact_type === "design-spec").slice(-1)[0];
  const buildManifest = artifacts.filter((a) => a.artifact_type === "build-manifest").slice(-1)[0];
  const qaReport = artifacts.filter((a) => a.artifact_type === "qa-report").slice(-1)[0];
  const deployManifest = artifacts.filter((a) => a.artifact_type === "deploy-manifest").slice(-1)[0];
  const ideaText = rawIdea?.payload?.raw_text || "";
  const current = project.current_phase;
  const preMkt = (phaseState as any)?.["pre-marketing"] ?? null;
  const design = (phaseState as any)?.["product-design"] ?? null;
  const engineering = (phaseState as any)?.["engineering"] ?? null;
  const qa = (phaseState as any)?.["qa"] ?? null;
  const deployment = (phaseState as any)?.["deployment"] ?? null;

  const phaseLabel = PHASES.find((p) => p.id === selectedPhase)?.name ?? selectedPhase;

  function handleSelect(id: string) {
    setSelectedPhase(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPhase() {
    switch (selectedPhase) {
      case "business-owner":
        return (
          <div className="card p-6 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">Raw idea</div>
            <p className="text-sm text-white/90 whitespace-pre-wrap">{ideaText || "No idea captured yet."}</p>
          </div>
        );
      case "product-owner": {
        const unlocked = !!productSpec || current === "product-owner" || current === "business-owner";
        return unlocked ? (
          <ProductOwner
            projectId={project.id}
            ideaText={ideaText}
            initialDialogue={phaseState?.["product-owner"] ?? null}
            spec={productSpec?.payload ?? null}
            onUpdated={refresh}
          />
        ) : (
          <div className="card p-6 text-sm text-muted">Locked until the prior phase completes.</div>
        );
      }
      case "idea-validation":
        return (
          <IdeaValidation
            projectId={project.id}
            hasSpec={!!productSpec}
            report={marketReport?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "pre-marketing":
        return (
          <PreMarketing
            projectId={project.id}
            hasSpec={!!productSpec}
            kit={preMkt?.kit ?? null}
            frameworks={preMkt?.frameworks ?? null}
            brief={audienceBrief?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "product-design":
        return (
          <ProductDesign
            projectId={project.id}
            hasSpec={!!productSpec}
            brief={design?.brief ?? null}
            direction={design?.direction ?? null}
            mockups={design?.mockups ?? null}
            approved={!!designSpec}
            onUpdated={refresh}
          />
        );
      case "engineering":
        return (
          <Engineering
            projectId={project.id}
            hasSpec={!!productSpec}
            state={engineering}
            manifest={buildManifest?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "qa":
        return (
          <QA
            projectId={project.id}
            hasManifest={!!buildManifest}
            state={qa}
            report={qaReport?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "deployment":
        return (
          <Deployment
            projectId={project.id}
            hasQaReport={!!qaReport}
            state={deployment}
            manifest={deployManifest?.payload ?? null}
            onUpdated={refresh}
          />
        );
      default:
        return (
          <div className="card p-6 text-sm text-muted">
            This phase hasn't been built yet. Check back as the pipeline grows.
          </div>
        );
    }
  }

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
        <div>
          {selectedPhase && (
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted">
              {phaseLabel}
            </h2>
          )}
          {renderPhase()}
        </div>

        <aside>
          <PhaseRail
            activeId={current}
            selectedId={selectedPhase ?? current}
            status={project.phase_status}
            onSelect={handleSelect}
          />
        </aside>
      </div>
    </main>
  );
}
