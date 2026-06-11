/**
 * Deploy-target contract — mirrors the connector/LLM registry pattern so
 * hosting providers are swappable. AWS Amplify is the active target; Vercel
 * and VPS are registered as coming_soon stubs (visible, not wired).
 *
 * A target's job is to render the agent-executed runbook (DEPLOY-PLAN.md)
 * for a given app + options. Execution happens in the app workspace via the
 * coding agent, same as the build (Phase 6) and QA (Phase 7) runs.
 */

export interface DeployOptions {
  /** Attach a managed WAF in front of the app (costs real money monthly — per-app decision). */
  waf: boolean;
  /** Custom domain (e.g. "myapp.com") — null = the host's free URL. */
  domain: string | null;
}

export interface DeployEnvVar {
  name: string;
  description: string;
  required: boolean;
  /** Secrets are set per-environment on the host, never committed. */
  secret: boolean;
}

export interface DeployRunbookContext {
  productTitle: string;
  slug: string;
  workspacePath: string;
  options: DeployOptions;
  envVars: DeployEnvVar[];
  /** Stack choices from the engineering phase (slot → choice id). */
  stack: { slot: string; choice: string }[];
}

export interface DeployTarget {
  id: string;
  label: string;
  status: "active" | "coming_soon";
  note: string;
  /** Render the full DEPLOY-PLAN.md the coding agent executes. */
  renderRunbook(ctx: DeployRunbookContext): string;
}
