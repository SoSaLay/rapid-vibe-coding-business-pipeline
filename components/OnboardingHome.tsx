"use client";

import { OnboardingPanel, type OnboardingStatus } from "./Onboarding";

/**
 * The Onboarding page — just the toolbox. Every tool the pipeline uses, the
 * section it powers, whether it's set, and an Update button. Set these once and
 * every stage runs without stopping to ask for a key.
 */
export function OnboardingHome({
  kind,
  onboarding,
  reloadOnboarding,
}: {
  kind?: string;
  onboarding: OnboardingStatus | null;
  reloadOnboarding: () => void;
}) {
  return (
    <div>
      <p className="mb-6 text-lg font-semibold text-fg">Set up one tool per section, and the whole pipeline runs smoothly.</p>
      <OnboardingPanel status={onboarding} onChanged={reloadOnboarding} kind={kind} />
    </div>
  );
}
