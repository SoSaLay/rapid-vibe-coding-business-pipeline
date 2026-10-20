/**
 * Agent slot registries + resolution (release-deployment.md → "How the swapping works").
 *
 * activeAdapter(slot, projectId) resolves in this order:
 *   1. the project's own choice (settings.agentStack[slot])
 *   2. else the slot's default adapter, if it's connected
 *   3. else the first connected adapter in the slot (fallback), else the default
 */

import { readConnectorConfig } from "../connectors/config";
import { getProjectSettings } from "../store";
import type { AgentAdapter, AgentSlot, CredentialsAdapter, FrameworkAdapter, UnitTestAdapter } from "./types";
import { langchainFramework } from "./adapters/langchain";
import { inAppCredentials } from "./adapters/credentials-in-app";
import { pytestUv } from "./adapters/pytest-uv";

export async function langsmithKey(): Promise<string | null> {
  return (await readConnectorConfig("langsmith"))?.apiKey || process.env.LANGSMITH_API_KEY || null;
}

export async function langfuseConfig(): Promise<{ publicKey: string; secretKey: string; host: string } | null> {
  const c = await readConnectorConfig("langfuse");
  const publicKey = c?.publicKey || process.env.LANGFUSE_PUBLIC_KEY || "";
  const secretKey = c?.secretKey || process.env.LANGFUSE_SECRET_KEY || "";
  if (!publicKey || !secretKey) return null;
  return { publicKey, secretKey, host: c?.host || process.env.LANGFUSE_HOST || "https://us.cloud.langfuse.com" };
}

const langfuseTracing: AgentAdapter = {
  id: "langfuse",
  slot: "tracing",
  label: "Langfuse",
  blurb: "Open-source tracing + eval dashboards. Free cloud tier (~50k observations/month) or self-host free.",
  status: "active",
  isConnected: async () => !!(await langfuseConfig()),
};

function planned(slot: AgentSlot, id: string, label: string, blurb: string, extra: Partial<AgentAdapter> = {}): AgentAdapter {
  return { id, slot, label, blurb, status: "planned", isConnected: async () => false, ...extra };
}

const langsmithTracing: AgentAdapter = {
  id: "langsmith",
  slot: "tracing",
  label: "LangSmith",
  blurb: "Traces every run; inspect them locally in LangSmith Studio. Free tier: 5k traces/month.",
  status: "active",
  isConnected: async () => !!(await langsmithKey()),
};

export const SLOT_LABELS: Record<AgentSlot, { label: string; section: string }> = {
  framework: { label: "Agent framework", section: "Agent Design · Development" },
  credentials: { label: "Tool credentials", section: "Agent Design · Deployment" },
  tracing: { label: "Tracing", section: "Development · Operations" },
  approval: { label: "Human approval", section: "Security" },
  auth: { label: "Authorization", section: "Security" },
  "unit-tests": { label: "Unit tests", section: "Evaluations" },
  evals: { label: "Eval runner", section: "Evaluations" },
  runtime: { label: "Runtime host", section: "Deployment" },
  "chat-ui": { label: "Chat UI", section: "Deployment" },
  "web-host": { label: "Web host", section: "Deployment" },
  ci: { label: "CI / release gates", section: "Deployment" },
  monitoring: { label: "Monitoring", section: "Operations" },
};

/** One list per slot; the first entry is the default. */
export const REGISTRY: Record<AgentSlot, AgentAdapter[]> = {
  framework: [
    langchainFramework,
    planned("framework", "crewai", "CrewAI", "Python framework for teams of role-based agents that hand work to each other."),
    planned("framework", "cloudflare-agents", "Cloudflare Agents", "TypeScript framework that is also its own host (Workers + Durable Objects). Would pair with a Cloudflare runtime."),
  ],
  credentials: [inAppCredentials, planned("credentials", "composio", "Composio", "Managed logins for hundreds of apps; each end user connects their own account.")],
  tracing: [langfuseTracing],
  // LangGraph interrupts ship inside the LangChain template (HumanInTheLoopMiddleware), so no key is needed.
  approval: [{ id: "langgraph", slot: "approval", label: "LangGraph interrupts", blurb: "Pauses approval-flagged tools until a human approves.", status: "active", isConnected: async () => true }],
  // Login follows the state database (Supabase Auth with Supabase, Neon Auth with Neon); Clerk when the agent charges users.
  auth: [
    planned("auth", "supabase-auth", "Supabase Auth", "Login + row-level isolation in the same Supabase project as agent state."),
    planned("auth", "neon-auth", "Neon Auth", "Login bundled with Neon Postgres."),
    planned("auth", "clerk", "Clerk", "Login + payments in one account; best when the agent charges users."),
  ],
  "unit-tests": [pytestUv],
  // The gate runs locally so a release never depends on a vendor; tracing tools are where you view the runs.
  evals: [
    { id: "local", slot: "evals", label: "Built-in eval runner", blurb: "Versioned dataset in the agent's repo, repeat trials, judges, pinned baseline.", status: "active", isConnected: async () => true },
  ],
  runtime: [
    planned("runtime", "agentcore", "Amazon Bedrock AgentCore", "Pay-per-use managed host; isolated sessions; builds the image in AWS."),
    planned("runtime", "railway", "Railway", "Container host that builds the Docker image from GitHub. ~$5/month Hobby."),
  ],
  "chat-ui": [
    planned("chat-ui", "agent-chat-ui", "Agent Chat UI", "Ready-made streaming chat frontend.", {
      requires: [{ slot: "runtime", adapterIds: [], reason: "Needs a LangGraph-compatible server as the runtime host." }],
    }),
  ],
  "web-host": [planned("web-host", "vercel", "Vercel", "Hosts the chat web app.")],
  ci: [planned("ci", "github-actions", "GitHub Actions", "Tests and evals on every pull request; approval-gated production.")],
  monitoring: [
    planned("monitoring", "langfuse-monitoring", "Langfuse", "Sampled online evals and dashboards on production runs."),
    planned("monitoring", "langsmith-monitoring", "LangSmith", "Alerts and online evals on production runs."),
  ],
};

export async function activeAdapter(slot: AgentSlot, projectId?: string): Promise<AgentAdapter> {
  const list = REGISTRY[slot];
  if (projectId) {
    const chosen = (await getProjectSettings(projectId)).agentStack?.[slot];
    const hit = chosen ? list.find((a) => a.id === chosen) : undefined;
    if (hit) return hit;
  }
  if (await list[0].isConnected()) return list[0];
  for (const a of list.slice(1)) if (await a.isConnected()) return a;
  return list[0];
}

export async function frameworkAdapter(projectId: string): Promise<FrameworkAdapter> {
  return (await activeAdapter("framework", projectId)) as FrameworkAdapter;
}
export async function credentialsAdapter(projectId: string): Promise<CredentialsAdapter> {
  const a = await activeAdapter("credentials", projectId);
  return (a.status === "active" ? a : inAppCredentials) as CredentialsAdapter;
}
export async function unitTestAdapter(projectId: string): Promise<UnitTestAdapter> {
  return (await activeAdapter("unit-tests", projectId)) as UnitTestAdapter;
}

/** Serializable view of the registries for the toolbox + Agent Stack picker. */
export async function registryInfo(projectId?: string) {
  const out = [];
  for (const slot of Object.keys(REGISTRY) as AgentSlot[]) {
    const active = await activeAdapter(slot, projectId);
    out.push({
      slot,
      ...SLOT_LABELS[slot],
      active: active.id,
      options: await Promise.all(
        REGISTRY[slot].map(async (a) => ({ id: a.id, label: a.label, blurb: a.blurb, status: a.status, connected: await a.isConnected(), requires: a.requires ?? [] }))
      ),
    });
  }
  return out;
}
