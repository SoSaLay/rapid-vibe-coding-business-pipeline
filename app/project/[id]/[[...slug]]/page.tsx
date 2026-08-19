"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DocSidebar } from "@/components/DocSidebar";
import { PhaseContents } from "@/components/PhaseContents";
import { OnboardingHome } from "@/components/OnboardingHome";
import { GateBanner } from "@/components/GateBanner";
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
import { OnboardingGate, useOnboarding } from "@/components/Onboarding";
import { PHASES, PHASE_ARTIFACTS, PHASE_SECTIONS, SINGLE_SECTION_PHASES, sectionAnchor } from "@/lib/pipeline";
import type { PhaseId } from "@/lib/pipeline";
import { phaseDisplayStatus } from "@/lib/pipeline-status";

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

export default function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  // Optional catch-all: undefined slug = Onboarding home; else [phaseId, ...].
  const slug = params.slug as string[] | undefined;
  const activeSlug = slug?.[0];
  // Each phase has two faces in the same reading column: the informational
  // document and the artifact screen. The second URL segment selects it
  // (/project/<id>/<phase>/artifacts) so it's a real, reloadable page reached
  // from the "View artifacts" button at the foot of the page's contents nav.
  const artifactMode = slug?.[1] === "artifacts";
  // Third segment selects one artifact (/artifacts/<artifactId>); without it the
  // artifact face shows the menu of this phase's artifacts.
  const artifactSlug = slug?.[2];

  const [data, setData] = useState<ProjectData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { status: onboarding, reload: reloadOnboarding } = useOnboarding();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset transient UI when the route changes via soft nav (phase or doc↔artifact).
  useEffect(() => { setShowDetail(false); setNavOpen(false); window.scrollTo({ top: 0 }); }, [activeSlug, artifactMode, artifactSlug]);

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

  const present = new Set(artifacts.map((a) => a.artifact_type));
  const phaseIndex = PHASES.findIndex((p) => p.id === activeSlug);
  const phaseDef = phaseIndex >= 0 ? PHASES[phaseIndex] : null;
  const selectedDisplay = phaseDef ? phaseDisplayStatus(phaseDef, project.phase_status, present) : null;

  // `mode` selects which face of a phase to render: "doc" = the informational
  // read, "artifacts" = the generate/execute hub. Phases that own an artifact
  // screen honor it; read-only phases ignore it.
  function renderPhase(mode: "doc" | "artifacts", artifact?: string) {
    switch (activeSlug) {
      case "business-owner":
        return (
          <div className="card p-6 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">Raw idea</div>
            <p className="text-sm text-fg/90 whitespace-pre-wrap">{ideaText || "No idea captured yet."}</p>
          </div>
        );
      case "product-owner": {
        const unlocked = !!productSpec || current === "product-owner" || current === "business-owner";
        if (unlocked && onboarding && !onboarding.requiredComplete) {
          return <OnboardingGate reload={reloadOnboarding} />;
        }
        return unlocked ? (
          <ProductOwner
            projectId={project.id}
            ideaText={ideaText}
            initialDialogue={phaseState?.["product-owner"] ?? null}
            spec={productSpec?.payload ?? null}
            mode={mode}
            artifact={artifact}
            onUpdated={refresh}
          />
        ) : (
          <div className="card p-6 text-sm text-muted">Locked until the prior phase completes.</div>
        );
      }
      case "idea-validation":
        return <IdeaValidation projectId={project.id} hasSpec={!!productSpec} report={marketReport?.payload ?? null} onUpdated={refresh} />;
      case "pre-marketing":
        return (
          <PreMarketing
            projectId={project.id}
            hasSpec={!!productSpec}
            kit={preMkt?.kit ?? null}
            frameworks={preMkt?.frameworks ?? null}
            brief={audienceBrief?.payload ?? null}
            mode={mode}
            artifact={artifact}
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
            mode={mode}
            artifact={artifact}
            onUpdated={refresh}
          />
        );
      case "engineering":
        return <Engineering projectId={project.id} hasSpec={!!productSpec} state={engineering} manifest={buildManifest?.payload ?? null} mode={mode} onUpdated={refresh} />;
      case "qa":
        return <QA projectId={project.id} hasManifest={!!buildManifest} state={qa} report={qaReport?.payload ?? null} onUpdated={refresh} />;
      case "deployment":
        return <Deployment projectId={project.id} hasQaReport={!!qaReport} state={deployment} manifest={deployManifest?.payload ?? null} onUpdated={refresh} />;
      case "marketing-sales":
        return <Marketing projectId={project.id} hasDeploy={!!deployManifest} state={marketing} report={campaignReport?.payload ?? null} mode={mode} artifact={artifact} onUpdated={refresh} />;
      case "operations":
        return <Operations projectId={project.id} hasDeploy={!!deployManifest} state={operations} report={opsReport?.payload ?? null} onUpdated={refresh} />;
      case "iteration":
        return <Iteration projectId={project.id} hasDeploy={!!deployManifest} state={iteration} cycle={project.cycle ?? 1} archived={!!project.archived} onUpdated={refresh} />;
      default:
        return <div className="card p-6 text-sm text-muted">This phase hasn't been built yet.</div>;
    }
  }

  return (
    <main className="paper mx-auto max-w-7xl px-4 py-6">
      {/* Mobile top bar */}
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button className="btn-ghost text-sm" onClick={() => setNavOpen((v) => !v)}>
          ☰ Phases
        </button>
        <span className="truncate text-sm font-medium text-fg">{project.title}</span>
        <ThemeToggle />
      </div>

      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        {/* Sidebar */}
        <aside className={`${navOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto`}>
          <div className="mb-3 hidden items-center justify-between gap-2 lg:flex">
            <Link href="/" className="text-xs text-muted transition-colors hover:text-fg">← Home</Link>
            <ThemeToggle />
          </div>
          <div className="mb-3">
            <div className="truncate text-sm font-semibold text-fg">{project.title}</div>
            {onboarding && !onboarding.requiredComplete && (
              <Link href={`/project/${id}`} className="mt-1 inline-block rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] text-bad">
                ✕ Complete onboarding
              </Link>
            )}
          </div>
          <DocSidebar projectId={id} activeSlug={activeSlug} status={project.phase_status} present={present} />
        </aside>

        {/* Main reading column */}
        <article className="min-w-0">
          {!activeSlug ? (
            <div className="mx-auto max-w-3xl">
              <OnboardingHome
                projectId={id}
                title={project.title}
                cycle={project.cycle}
                archived={project.archived}
                status={project.phase_status}
                present={present}
                currentPhaseId={current}
                onboarding={onboarding}
                reloadOnboarding={reloadOnboarding}
              />
            </div>
          ) : (
            // A phase page carries its OWN left-hand contents nav — the sections of
            // this phase (or its artifact menu), which used to hang off the pipeline
            // menu. The pipeline menu itself is now a flat list of phases.
            // Explicit grid placement, because the reading order differs by size: on a
            // phone the title comes FIRST and the contents nav sits under it as a chip
            // strip; from lg up the nav is a rail in its own column, spanning both rows.
            <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
              <div className="min-w-0 lg:col-start-2 lg:row-start-1">
                {phaseDef && (
                  <header
                    // Single-heading workflow phases anchor their lone contents entry
                    // to this header (multi-section reads anchor into their own
                    // <DocSection> bodies instead).
                    id={
                      !artifactMode && activeSlug && SINGLE_SECTION_PHASES.has(activeSlug as PhaseId)
                        ? sectionAnchor(PHASE_SECTIONS[activeSlug as PhaseId][0])
                        : undefined
                    }
                    className="mb-6 scroll-mt-24 border-b border-edge pb-5"
                  >
                    <div className="wp-eyebrow">{activeSlug === "iteration" ? "↻ Action" : `Stage ${phaseIndex + 1}`}</div>
                    <h2 className="wp-title mt-1.5">{phaseDef.name}</h2>
                    <button onClick={() => setShowDetail((v) => !v)} className="mt-2 text-[11px] font-medium text-muted hover:text-fg">
                      {showDetail ? "Hide details" : "Show more"}
                    </button>
                    {showDetail && <p className="wp-lede mt-2">{phaseDef.description}</p>}
                  </header>
                )}
              </div>

              {/* The ASIDE is the sticky element (same pattern as the pipeline rail):
                  a sticky child would be trapped inside a box that is only as tall as
                  itself, and so would never travel. `self-start` keeps it at content
                  height on desktop, which is what gives sticky its room in the grid. */}
              <aside
                className="sticky top-0 z-20 mb-6 lg:top-6 lg:z-auto lg:mb-0 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
              >
                <PhaseContents
                  projectId={id}
                  phaseId={activeSlug as PhaseId}
                  artifactMode={artifactMode}
                  activeArtifact={artifactSlug}
                />
              </aside>

              <div className="min-w-0 lg:col-start-2 lg:row-start-2">
                {artifactMode ? (
                  artifactSlug || !PHASE_ARTIFACTS[activeSlug as keyof typeof PHASE_ARTIFACTS] ? (
                    renderPhase("artifacts", artifactSlug)
                  ) : (
                    <div className="doc">
                      <p className="doc-p">Pick an artifact from the menu to generate it.</p>
                    </div>
                  )
                ) : (
                  <>
                    {selectedDisplay?.blockedReason && <GateBanner reason={selectedDisplay.blockedReason} />}
                    {renderPhase("doc")}
                  </>
                )}
              </div>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
