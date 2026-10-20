"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DocSidebar } from "@/components/DocSidebar";
import { PhaseContents } from "@/components/PhaseContents";
import { ArtifactTiles } from "@/components/ArtifactTiles";
import { OperationsIterate } from "@/components/OperationsIterate";
import { OnboardingHome } from "@/components/OnboardingHome";
import { GateBanner } from "@/components/GateBanner";
import { ProductOwner } from "@/components/ProductOwner";
import { IdeaValidation } from "@/components/IdeaValidation";
import { PreMarketing } from "@/components/PreMarketing";
import { ProductDesign } from "@/components/ProductDesign";
import { Engineering } from "@/components/Engineering";
import { AgentDesign } from "@/components/AgentDesign";
import { AgentEngineering } from "@/components/AgentEngineering";
import { AgentEvals } from "@/components/AgentEvals";
import { AgentDeployment } from "@/components/AgentDeployment";
import { AgentOperations } from "@/components/AgentOperations";
import { QA } from "@/components/QA";
import { Deployment } from "@/components/Deployment";
import { Marketing } from "@/components/Marketing";
import { Operations } from "@/components/Operations";
import { Iteration } from "@/components/Iteration";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingGate, useOnboarding } from "@/components/Onboarding";
import { PHASE_ARTIFACTS, phasesFor } from "@/lib/pipeline";
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
    kind?: string;
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
  // ?autostart=1: start this stage's first step on arrival (new agent, or the previous stage's Start button).
  const autostart = useSearchParams().get("autostart") === "1";
  const activeSlug = slug?.[0];
  // Each phase has two faces in the same reading column: the informational
  // document and the artifact screen. The second URL segment selects it
  // (/project/<id>/<phase>/artifacts) so it's a real, reloadable page reached
  // from the artifact tiles at the top of the phase page.
  const artifactMode = slug?.[1] === "artifacts";
  // Third segment selects one artifact (/artifacts/<artifactId>); without it the
  // artifact face shows the menu of this phase's artifacts.
  const artifactSlug = slug?.[2];

  const [data, setData] = useState<ProjectData | null>(null);
  const [showIdea, setShowIdea] = useState(false);
  const [showIterate, setShowIterate] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { status: onboarding, reload: reloadOnboarding } = useOnboarding();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // While work runs in the background (the auto-flow, or any long job: evaluations, test cases, checks,
  // builds, fixes), keep every page and the sidebar current. Agents are also checked now and then, so work
  // started elsewhere shows up; and a page that starts a job says so right away ("pipeline:busy").
  const flowRunning = !!(data?.phaseState as any)?.autoflow?.running || ((data?.phaseState as any)?.activity ?? []).length > 0;
  const isAgent = data?.project?.kind === "agent";
  useEffect(() => {
    if (!flowRunning && !isAgent) return;
    const t = setInterval(refresh, flowRunning ? 3000 : 15000);
    return () => clearInterval(t);
  }, [flowRunning, isAgent, refresh]);
  useEffect(() => {
    const onBusy = () => setTimeout(refresh, 700);
    window.addEventListener("pipeline:busy", onBusy);
    return () => window.removeEventListener("pipeline:busy", onBusy);
  }, [refresh]);

  // Reset transient UI when the route changes via soft nav (phase or doc↔artifact).
  useEffect(() => { setShowIdea(false); setShowIterate(false); setNavOpen(false); window.scrollTo({ top: 0 }); }, [activeSlug, artifactMode, artifactSlug]);

  if (!data) return <main className="mx-auto max-w-5xl px-4 py-8 text-muted">Loading…</main>;

  const { project, artifacts, phaseState } = data;
  const rawIdea = artifacts.filter((a) => a.artifact_type === "raw-idea").slice(-1)[0];
  const productSpec = artifacts.filter((a) => a.artifact_type === "product-spec").slice(-1)[0];
  const marketReport = artifacts.filter((a) => a.artifact_type === "market-report").slice(-1)[0];
  const audienceBrief = artifacts.filter((a) => a.artifact_type === "audience-brief").slice(-1)[0];
  const agentDesignArt = artifacts.filter((a) => a.artifact_type === "agent-design").slice(-1)[0];
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
  // Agents: which stages are working on a change in the background, or waiting on the owner.
  const flow = (phaseState as any)?.autoflow;
  const gh = (phaseState as any)?.github;
  const liveStages: Record<string, "working" | "attention"> = {};
  for (const a of ((phaseState as any)?.activity ?? []) as { phase: string }[]) liveStages[a.phase] = "working";
  if (flow?.running && flow.phase) liveStages[flow.phase] = "working";
  else if (!liveStages.deployment && gh?.unpushed > 0 && project.phase_status.deployment && project.phase_status.deployment !== "locked") liveStages.deployment = "attention";
  const phases = phasesFor(project.kind);
  const phaseIndex = phases.findIndex((p) => p.id === activeSlug);
  const phaseDef = phaseIndex >= 0 ? phases[phaseIndex] : null;
  const selectedDisplay = phaseDef ? phaseDisplayStatus(phaseDef, project.phase_status, present, phases) : null;

  // `mode` selects which face of a phase to render: "doc" = the informational
  // read, "artifacts" = the generate/execute hub. Phases that own an artifact
  // screen honor it; read-only phases ignore it.
  function renderPhase(mode: "doc" | "artifacts", artifact?: string) {
    switch (activeSlug) {
      case "product-owner": {
        const unlocked = !!productSpec || current === "product-owner" || current === "business-owner";
        if (unlocked && onboarding && !onboarding.requiredComplete) {
          return <OnboardingGate reload={reloadOnboarding} kind={project.kind} />;
        }
        return unlocked ? (
          <ProductOwner
            projectId={project.id}
            initialDialogue={phaseState?.["product-owner"] ?? null}
            spec={productSpec?.payload ?? null}
            mode={mode}
            artifact={artifact}
            stageName={phaseDef?.name}
            autostart={autostart}
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
        if (project.kind === "agent") {
          return (
            <AgentEngineering
              projectId={project.id}
              hasDesign={!!agentDesignArt}
              designVersion={agentDesignArt?.version ?? 0}
              build={engineering?.agentBuild ?? null}
              manifest={buildManifest?.payload ?? null}
              security={(phaseState as any)?.security?.report ?? null}
              autoflow={(phaseState as any)?.autoflow ?? null}
              activity={(phaseState as any)?.activity ?? []}
              githubUrl={(phaseState as any)?.github?.url ?? null}
              autostart={autostart}
              onUpdated={refresh}
            />
          );
        }
        return <Engineering projectId={project.id} hasSpec={!!productSpec} state={engineering} manifest={buildManifest?.payload ?? null} mode={mode} onUpdated={refresh} />;
      case "agent-design":
        return (
          <AgentDesign
            projectId={project.id}
            hasSpec={!!productSpec}
            state={(phaseState as any)?.["agent-design"] ?? null}
            spec={productSpec?.payload ?? null}
            autostart={autostart}
            builtVersion={engineering?.agentBuild?.design_version ?? null}
            approvedVersion={agentDesignArt?.version ?? 0}
            onUpdated={refresh}
          />
        );
      case "qa":
        if (project.kind === "agent") {
          return (
            <AgentEvals
              projectId={project.id}
              hasSecurity={project.phase_status.engineering === "complete"}
              state={qa}
              completed={project.phase_status.qa === "complete"}
              autostart={autostart}
              onUpdated={refresh}
            />
          );
        }
        return <QA projectId={project.id} hasManifest={!!buildManifest} state={qa} report={qaReport?.payload ?? null} onUpdated={refresh} />;
      case "deployment":
        if (project.kind === "agent") {
          return (
            <AgentDeployment
              projectId={project.id}
              hasEvals={project.phase_status.qa === "complete"}
              completed={project.phase_status.deployment === "complete"}
              autoflow={(phaseState as any)?.autoflow ?? null}
              github={(phaseState as any)?.github ?? null}
              autostart={autostart}
              onUpdated={refresh}
            />
          );
        }
        return <Deployment projectId={project.id} hasQaReport={!!qaReport} state={deployment} manifest={deployManifest?.payload ?? null} onUpdated={refresh} />;
      case "marketing-sales":
        return <Marketing projectId={project.id} hasDeploy={!!deployManifest} state={marketing} report={campaignReport?.payload ?? null} mode={mode} artifact={artifact} onUpdated={refresh} />;
      case "operations":
        if (project.kind === "agent") {
          return (
            <AgentOperations
              projectId={project.id}
              live={project.phase_status.deployment === "complete"}
              completed={project.phase_status.operations === "complete"}
              onUpdated={refresh}
            />
          );
        }
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
        <span className="truncate text-sm font-medium text-fg"><span className="text-muted">{project.kind === "agent" ? "Agent" : "Application"}: </span>{project.title}</span>
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
            <div className="truncate text-sm font-semibold text-fg"><span className="font-medium text-muted">{project.kind === "agent" ? "Agent" : "Application"}: </span>{project.title}</div>
          </div>
          <DocSidebar projectId={id} activeSlug={activeSlug} status={project.phase_status} present={present} kind={project.kind} onboarding={onboarding} live={liveStages} />
        </aside>

        {/* Main reading column */}
        <article className="min-w-0">
          {!activeSlug ? (
            <div className="mx-auto max-w-3xl">
              <OnboardingHome kind={project.kind} onboarding={onboarding} reloadOnboarding={reloadOnboarding} />
            </div>
          ) : (
            // The report is one reading column: header, the phase's artifacts as
            // tiles, then the read. An artifact page adds a left-hand nav (back to
            // the report + sibling artifacts): a chip strip under the title on a
            // phone, a rail in its own column spanning both rows from lg up.
            <div className={artifactMode ? "mx-auto max-w-5xl lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10" : "mx-auto max-w-3xl"}>
              <div className="min-w-0 lg:col-start-2 lg:row-start-1">
                {phaseDef && (
                  <header className="mb-6 border-b border-edge pb-5">
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                      <div>
                        <div className="wp-eyebrow">{activeSlug === "iteration" ? "↻ Action" : `Stage ${phaseIndex + 1}`}</div>
                        <h2 className="wp-title mt-1.5">{phaseDef.name}</h2>
                      </div>
                    </div>
                    {activeSlug === "product-owner" ? (
                      // Define the Problem / Define the Job is where the raw idea lives now (there is no capture stage).
                      <>
                        <button
                          onClick={() => setShowIdea((v) => !v)}
                          className="mt-3 rounded-md border border-edge px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-accent/60 hover:text-fg"
                        >
                          {showIdea ? "Hide raw idea" : "Show raw idea"}
                        </button>
                        {showIdea && (
                          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-edge bg-panel p-4 text-sm text-fg/90">
                            {ideaText || "No idea captured yet."}
                          </p>
                        )}
                      </>
                    ) : activeSlug === "operations" && project.kind !== "agent" ? (
                      <>
                        <button
                          onClick={() => setShowIterate((v) => !v)}
                          className="mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/20"
                        >
                          ↻ {showIterate ? "Hide iterate" : "Iterate"}
                        </button>
                        {showIterate && <OperationsIterate kind={project.kind} projectId={project.id} />}
                      </>
                    ) : null}
                  </header>
                )}
              </div>

              {/* The ASIDE is the sticky element (same pattern as the pipeline rail):
                  a sticky child would be trapped inside a box that is only as tall as
                  itself, and so would never travel. `self-start` keeps it at content
                  height on desktop, which is what gives sticky its room in the grid. */}
              {artifactMode && (
                <aside
                  className="sticky top-0 z-20 mb-6 lg:top-6 lg:z-auto lg:mb-0 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
                >
                  <PhaseContents projectId={id} phaseId={activeSlug as PhaseId} activeArtifact={artifactSlug} />
                </aside>
              )}

              <div className="min-w-0 lg:col-start-2 lg:row-start-2">
                {artifactMode ? (
                  artifactSlug || !PHASE_ARTIFACTS[activeSlug as keyof typeof PHASE_ARTIFACTS] ? (
                    renderPhase("artifacts", artifactSlug)
                  ) : (
                    <ArtifactTiles projectId={id} phaseId={activeSlug as PhaseId} />
                  )
                ) : (
                  <>
                    {/* Agents: each stage is one page with a single Start button, so no tiles or "locked" banner. */}
                    {project.kind !== "agent" && <ArtifactTiles projectId={id} phaseId={activeSlug as PhaseId} />}
                    {project.kind !== "agent" && selectedDisplay?.blockedReason && <GateBanner reason={selectedDisplay.blockedReason} />}
                    {renderPhase("doc")}
                    {(() => {
                      // One big button to the next stage once this one is done; the next page starts itself.
                      const next = phaseIndex >= 0 ? phases[phaseIndex + 1] : undefined;
                      // Agent Design has its own Start button at the top (it approves first).
                      if (!next || next.id === "iteration" || activeSlug === "agent-design" || project.phase_status[activeSlug as string] !== "complete") return null;
                      return (
                        <div className="mt-12 border-t border-edge pt-8">
                          <button
                            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-100"
                            onClick={() => router.push(`/project/${id}/${next.id}?autostart=1`)}
                          >
                            Start {next.name} →
                          </button>
                        </div>
                      );
                    })()}
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
