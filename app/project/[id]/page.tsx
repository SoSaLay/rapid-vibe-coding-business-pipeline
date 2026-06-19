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
import { Marketing } from "@/components/Marketing";
import { Operations } from "@/components/Operations";
import { Iteration } from "@/components/Iteration";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PHASES } from "@/lib/pipeline";

interface Artifact {
  artifact_type: string;
  version: number;
  payload: any;
}
interface ProjectData {
  project: {
    id: string;
    title: string;
    current_phase: string;
    phase_status: Record<string, any>;
    cycle?: number;
    archived?: boolean;
  };
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
  const campaignReport = artifacts.filter((a) => a.artifact_type === "campaign-report").slice(-1)[0];
  const opsReport = artifacts.filter((a) => a.artifact_type === "ops-report").slice(-1)[0];
  const ideaText = rawIdea?.payload?.raw_text || "";
  const current = project.current_phase;
  const preMkt = (phaseState as any)?.["pre-marketing"] ?? null;
  const design = (phaseState as any)?.["product-design"] ?? null;
  const engineering = (phaseState as any)?.["engineering"] ?? null;
  const qa = (phaseState as any)?.["qa"] ?? null;
  const deployment = (phaseState as any)?.["deployment"] ?? null;
  const marketing = (phaseState as any)?.["marketing-sales"] ?? null;
  const operations = (phaseState as any)?.["operations"] ?? null;
  const iteration = (phaseState as any)?.["iteration"] ?? null;

  const phaseIndex = PHASES.findIndex((p) => p.id === selectedPhase);
  const phaseDef = phaseIndex >= 0 ? PHASES[phaseIndex] : null;
  const phaseLabel = phaseDef?.name ?? selectedPhase;

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
            mockupEngines={design?.mockupEngines ?? null}
            logo={design?.logo ?? null}
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
      case "marketing-sales":
        return (
          <Marketing
            projectId={project.id}
            hasDeploy={!!deployManifest}
            state={marketing}
            report={campaignReport?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "operations":
        return (
          <Operations
            projectId={project.id}
            hasDeploy={!!deployManifest}
            state={operations}
            report={opsReport?.payload ?? null}
            onUpdated={refresh}
          />
        );
      case "iteration":
        return (
          <Iteration
            projectId={project.id}
            hasDeploy={!!deployManifest}
            state={iteration}
            cycle={project.cycle ?? 1}
            archived={!!project.archived}
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

  const currentLabel = PHASES.find((p) => p.id === current)?.name ?? current;

  return (
    <main className="paper mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-muted transition-colors hover:text-fg">
            ← All ideas
          </Link>
          <h1 className="mt-2 truncate text-xl font-semibold tracking-tight text-fg">{project.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>Currently at {currentLabel}</span>
            {(project.cycle ?? 1) > 1 && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">Cycle {project.cycle}</span>
            )}
            {project.archived && (
              <span className="rounded bg-bad/15 px-2 py-0.5 text-xs text-bad">Archived</span>
            )}
          </p>
        </div>
        <ThemeToggle className="mt-1 shrink-0" />
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Sticky document outline — click any heading to jump into it */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <PhaseRail
            activeId={current}
            selectedId={selectedPhase ?? current}
            status={project.phase_status}
            onSelect={handleSelect}
          />
        </aside>

        {/* The white-paper reading column */}
        <article className="min-w-0">
          <div className="mx-auto max-w-3xl">
            {phaseDef && (
              <header className="mb-6 border-b border-edge pb-5">
                <div className="wp-eyebrow">
                  Phase {phaseIndex + 1} · {phaseDef.short}
                  {phaseDef.gate === "optional" && <span className="ml-2 text-muted/70">optional</span>}
                </div>
                <h2 className="wp-title mt-1.5">{phaseLabel}</h2>
                <p className="wp-lede mt-2">{phaseDef.description}</p>
              </header>
            )}
            {renderPhase()}
          </div>
        </article>
      </div>
    </main>
  );
}
