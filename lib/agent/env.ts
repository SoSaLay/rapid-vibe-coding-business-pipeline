/**
 * The env a generated agent runs with: its model key (reused from the
 * orchestrator's own AI-engine key when it's the same provider), LangSmith
 * tracing, and the tool credentials from the credentials slot. Values never
 * leave the machine except into the agent's own gitignored .env.
 */

import { readConnectorConfig } from "../connectors/config";
import { credentialsAdapter, langfuseConfig, langsmithKey } from "./registry";
import { modelKeyEnv, type AgentDesign } from "./design";

export async function modelKey(modelId: string): Promise<string | null> {
  const env = modelKeyEnv(modelId);
  return (await readConnectorConfig(env === "OPENAI_API_KEY" ? "ai-openai" : "ai-anthropic"))?.apiKey || process.env[env] || null;
}

export async function agentEnv(projectId: string, design: AgentDesign, slug: string): Promise<Record<string, string>> {
  const env: Record<string, string> = { ...(await (await credentialsAdapter(projectId)).envFor(projectId)) };
  const mk = await modelKey(design.model.selected);
  if (mk && !env[modelKeyEnv(design.model.selected)]) env[modelKeyEnv(design.model.selected)] = mk;
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
