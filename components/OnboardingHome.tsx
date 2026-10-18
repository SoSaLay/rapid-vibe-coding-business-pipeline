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
      <OnboardingPanel status={onboarding} onChanged={reloadOnboarding} kind={kind} />
    </div>
  );
}
