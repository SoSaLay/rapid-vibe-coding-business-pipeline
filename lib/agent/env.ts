/**
 * The env a generated agent runs with: its model key (reused from the
 * orchestrator's own AI-engine key when it's the same provider), LangSmith
 * tracing, and the tool credentials from the credentials slot. Values never
 * leave the machine except into the agent's own gitignored .env.
 */

import { readConnectorConfig } from "../connectors/config";
import { credentialsAdapter, langfuseConfig, langsmithKey } from "./registry";
import { modelKeyEnv, type AgentDesign } from "./design";

/** The model key, reused from the orchestrator's own engine when it's Claude or OpenAI (not for custom endpoints). */
export async function modelKey(modelId: string, endpoint?: string): Promise<string | null> {
  const env = modelKeyEnv(modelId);
  if (!env) return null;
  if (env === "ANTHROPIC_API_KEY" || (env === "OPENAI_API_KEY" && !endpoint)) {
    return (await readConnectorConfig(env === "OPENAI_API_KEY" ? "ai-openai" : "ai-anthropic"))?.apiKey || process.env[env] || null;
  }
  return null;
}

/** The small model that grades evals, per provider (others grade with the agent's own model). */
const GRADER_MODEL: Record<string, string> = {
  anthropic: "anthropic:claude-haiku-5-5",
};

export async function agentEnv(projectId: string, design: AgentDesign, slug: string): Promise<Record<string, string>> {
  const env: Record<string, string> = { ...(await (await credentialsAdapter(projectId)).envFor(projectId)) };
  const keyEnv = modelKeyEnv(design.model.selected);
  const mk = await modelKey(design.model.selected, design.model_endpoint);
  if (keyEnv && mk && !env[keyEnv]) env[keyEnv] = mk;
  if (design.model_endpoint) env.OPENAI_BASE_URL = design.model_endpoint;
  // Document search embeds queries with OpenAI; reuse the orchestrator's OpenAI key when there's no agent-specific one.
  if (design.knowledge?.mode === "rag" && !env.OPENAI_API_KEY) {
    const k = (await readConnectorConfig("ai-openai"))?.apiKey || process.env.OPENAI_API_KEY;
    if (k && !design.model_endpoint) env.OPENAI_API_KEY = k;
  }
  // Grading test runs is a simple pass/fail judgment: use the provider's small model, not the agent's (often much pricier) one.
  const grader = GRADER_MODEL[design.model.selected.split(":")[0]];
  if (grader && !design.model_endpoint) env.EVAL_JUDGE_MODEL = grader;
  if (design.model_price) {
    env.MODEL_PRICE_IN = String(design.model_price.input);
    env.MODEL_PRICE_OUT = String(design.model_price.output);
  }
  const lf = await langfuseConfig();
  if (lf) {
    env.LANGFUSE_PUBLIC_KEY = lf.publicKey;
    env.LANGFUSE_SECRET_KEY = lf.secretKey;
    env.LANGFUSE_HOST = lf.host;
    env.LANGFUSE_BASE_URL = lf.host;
  }
  const ls = await langsmithKey();
  if (ls) {
    env.LANGSMITH_TRACING = "true";
    env.LANGSMITH_API_KEY = ls;
    env.LANGSMITH_PROJECT = slug;
  }
  return env;
}

/**
 * Render a .env file. Plain values stay unquoted (Docker's --env-file keeps quotes literally);
 * anything with spaces, '#', quotes or newlines is quoted, which python-dotenv understands.
 */
export function renderDotEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${/^[A-Za-z0-9_\-.:/+=@,]*$/.test(v) ? v : JSON.stringify(v)}`)
    .join("\n") + "\n";
}
