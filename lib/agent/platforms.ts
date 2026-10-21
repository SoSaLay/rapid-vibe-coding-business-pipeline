/**
 * Where an agent is built and hosted (Development's three tabs):
 *  - "self":    our way. LangChain code we write, any model, hosted on AgentCore or Railway.
 *  - "claude":  Claude's hosted agents (Anthropic Managed Agents). Claude models only.
 *  - "chatgpt": ChatGPT's hosted agents (OpenAI Agents API). OpenAI models only.
 *
 * An agent can be built more than one way; each build is kept separately. Pure (no I/O): used by pages too.
 */

import { AGENT_MODELS } from "./design";

export type PlatformId = "self" | "claude" | "chatgpt";

export interface Platform {
  id: PlatformId;
  label: string;
  /** One line under the tab. */
  blurb: string;
  /** Model id prefix this platform runs ("" = any). */
  provider: "" | "anthropic" | "openai";
  /** Where the owner sees the agent on the platform. */
  console?: string;
}

export const PLATFORMS: Platform[] = [
  { id: "self", label: "Self-hosted agent", blurb: "Any model. We write the code and host it (AWS or Railway).", provider: "" },
  {
    id: "claude",
    label: "Claude",
    blurb: "Built and hosted by Anthropic. Claude models only.",
    provider: "anthropic",
    console: "https://platform.claude.com/workspaces/default/agents",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "Built and hosted by OpenAI. OpenAI models only.",
    provider: "openai",
    console: "https://platform.openai.com/agents",
  },
];

export function platform(id: PlatformId): Platform {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

/** Can this platform run the model picked in Agent Design? */
export function runsModel(id: PlatformId, model: string): boolean {
  const p = platform(id);
  return !p.provider || model.startsWith(`${p.provider}:`);
}

/** The models to offer when the picked one doesn't fit the platform. */
export function modelsFor(id: PlatformId) {
  const p = platform(id);
  return AGENT_MODELS.filter((m) => !p.provider || m.id.startsWith(`${p.provider}:`));
}

/** "anthropic:claude-sonnet-5-5" → "claude-sonnet-5-5" (what the platform's API takes). */
export const bareModel = (model: string) => model.split(":").slice(1).join(":") || model;

/** A build on Claude or ChatGPT: the platform's ids for what we created, and how the last test went. */
export interface PlatformBuild {
  platform: Exclude<PlatformId, "self">;
  design_version: number;
  model: string;
  agent_id: string;
  agent_version?: number | string;
  environment_id: string;
  vault_id?: string;
  skill_id?: string;
  /** What this copy was built from (lib/agent/hosted/sync.ts): a change there means it needs updating. */
  synced_fp?: string;
  /** ChatGPT: the sandbox settings (so a test run can add its test data to a copy). */
  env_config?: Record<string, unknown>;
  /** Where to see the agent on the platform. */
  url?: string;
  built_at: string;
  /** Keys the agent needs that weren't set when it was built (it can't use those tools yet). */
  missing_keys?: string[];
  test?: { at: string; ok: boolean; cases: { input: string; output: string; ok: boolean; reason?: string; session_url?: string }[] };
  error?: string;
}
