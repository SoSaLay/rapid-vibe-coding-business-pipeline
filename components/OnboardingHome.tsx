"use client";

import Link from "next/link";
import { OnboardingPanel, type OnboardingStatus } from "./Onboarding";
import { PipelineSummary } from "./PipelineSummary";

type StoredState = "locked" | "available" | "active" | "complete" | "skipped";

/**
 * The Onboarding home screen — the project workspace index (replaces the old popup
 * as the primary place to get set up). Intro to the pipeline + inline API-key setup +
 * a compact progress overview that links into the next actionable phase.
 */
export function OnboardingHome({
  projectId,
  title,
  cycle,
  archived,
  status,
  present,
  currentPhaseId,
  onboarding,
  reloadOnboarding,
}: {
  projectId: string;
  title: string;
  cycle?: number;
  archived?: boolean;
  status?: Record<string, StoredState>;
  present: Set<string>;
  currentPhaseId?: string;
  onboarding: OnboardingStatus | null;
  reloadOnboarding: () => void;
}) {
  return (
    <div className="space-y-8">
      <header>
        <div className="wp-eyebrow">Welcome</div>
        <h1 className="wp-title mt-1.5 text-3xl">{title}</h1>
        <p className="wp-lede mt-3 max-w-2xl">
          This is your build pipeline — from a raw idea to a shipped, marketed product. Each phase in the
          sidebar produces an artifact the next one builds on. Work top-to-bottom, or jump to any phase.
          Start by connecting your keys below, then open <span className="text-fg">Business Owner</span> to
          capture your idea.
        </p>
      </header>

      <PipelineSummary
        title={title}
        cycle={cycle}
        archived={archived}
        status={status}
        present={present}
        currentPhaseId={currentPhaseId}
        onSelect={(id) => { window.location.href = `/project/${projectId}/${id}`; }}
      />

      <section>
        <h2 className="text-lg font-semibold text-fg">Get set up</h2>
        <p className="mt-1 text-sm text-muted">
          Connect your keys once — stored locally, reused across every idea and phase. An AI engine (Claude or
          OpenAI) is required to start; each optional service unlocks more of the pipeline.
        </p>
        <div className="card mt-4 p-5">
          <OnboardingPanel status={onboarding} onChanged={reloadOnboarding} />
        </div>
      </section>

      <section className="border-t border-edge pt-5">
        <h2 className="text-lg font-semibold text-fg">Start building</h2>
        <p className="mt-1 text-sm text-muted">Capture your idea to kick off the pipeline.</p>
        <Link href={`/project/${projectId}/business-owner`} className="btn-primary mt-3 inline-flex">
          Go to Business Owner →
        </Link>
      </section>
    </div>
  );
}
