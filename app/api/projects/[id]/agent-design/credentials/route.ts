import { NextRequest, NextResponse } from "next/server";
import { scheduleHostedSync } from "@/lib/agent/hosted/sync";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState } from "@/lib/store";
import type { AgentBuildState } from "@/lib/agent/build-context";
import { credentialsAdapter } from "@/lib/agent/registry";
import { modelKeyEnv, type AgentDesign } from "@/lib/agent/design";
import { modelKey } from "@/lib/agent/env";
import { readConnectorConfig } from "@/lib/connectors/config";
import { keyHelp } from "@/lib/agent/key-help";
import { mcpService, mcpServiceFor } from "@/lib/agent/mcp-catalog";
import { mcpToken } from "@/lib/agent/mcp-auth";

/** Every key the built agent needs, whether each is set, and how to get it. Never returns values. */
async function status(projectId: string) {
  const state = await getPhaseState<{ design: AgentDesign }>(projectId, "agent-design");
  const design = state?.design;
  if (!design) return { items: [] };
  const creds = await credentialsAdapter(projectId);
  // One row per env var: several tools often share one credential (e.g. a Gmail token).
  // `mcp`: the service also has an official MCP server you can sign in to instead of pasting this key.
  const needed: { env: string; label: string; tool: string; mcp?: { id: string; label: string } }[] = [];
  for (const t of design.tools.filter((t) => t.enabled && t.credential_env)) {
    const row = needed.find((n) => n.env === t.credential_env);
    if (row) row.tool += `, ${t.name}`;
    else {
      const svc = mcpServiceFor(t.credential_env, t.credential_label, t.integration);
      needed.push({ env: t.credential_env, label: t.credential_label || t.credential_env, tool: t.name, ...(svc ? { mcp: { id: svc.id, label: svc.label } } : {}) });
    }
  }
  for (const m of design.mcp_servers ?? []) {
    if (m.signin) continue; // shown as a sign-in below
    if (m.token_env && !needed.some((n) => n.env === m.token_env)) needed.push({ env: m.token_env, label: `${m.name} MCP token`, tool: `mcp:${m.name}` });
  }
  // Services the agent signs in to through their MCP server (instead of a key).
  const signins = await Promise.all(
    (design.mcp_servers ?? [])
      .filter((m) => m.signin)
      .map(async (m) => {
        const svc = mcpService(m.name);
        return {
          env: m.token_env,
          label: `${svc?.label ?? m.name} (signed in through MCP)`,
          tool: m.replaces?.length ? m.replaces.join(", ") : `${svc?.label ?? m.name} tools`,
          set: !!(await mcpToken(m.name, projectId).catch(() => null)),
          shared: false,
          signin: { id: m.name, label: svc?.label ?? m.name },
        };
      }),
  );
  // The built code can read more env vars than the design names (e.g. a database id).
  const built = (await getPhaseState<{ agentBuild?: AgentBuildState }>(projectId, "engineering"))?.agentBuild;
  const modelEnvName = modelKeyEnv(design.model.selected);
  for (const env of built?.env_vars ?? []) {
    if (env !== modelEnvName && !needed.some((n) => n.env === env)) needed.push({ env, label: env.replace(/_/g, " ").toLowerCase(), tool: "(built code)" });
  }
  const missing = new Set(await creds.missing(projectId, needed.map((n) => n.env)));
  // The model key is shared with the orchestrator's own AI engine when it's the same provider.
  const modelEnv = modelKeyEnv(design.model.selected);
  const shared = !!(await modelKey(design.model.selected, design.model_endpoint));
  const modelSet = !modelEnv || shared || !(await creds.missing(projectId, [modelEnv])).length;
  const rag = design.knowledge?.mode === "rag" && modelEnv !== "OPENAI_API_KEY";
  const embedShared = rag && !!(await readConnectorConfig("ai-openai"))?.apiKey;
  const embedSet = embedShared || (rag && !(await creds.missing(projectId, ["OPENAI_API_KEY"])).length);
  const items = [
      ...(rag ? [{ env: "OPENAI_API_KEY", label: "OpenAI key (document search only)", tool: "search_knowledge", set: embedSet, shared: embedShared }] : []),
      ...(modelEnv ? [{ env: modelEnv, label: "Model API key", tool: "(model)", set: modelSet, shared }] : []),
      ...needed.map((n) => ({ ...n, set: !missing.has(n.env), shared: false })),
  ];
  for (const s of signins) items.push(s as any);
  return {
    items: items.map((i: any) => ({
      ...i,
      help: i.signin
        ? `Uses ${i.signin.label}'s official MCP server with your sign-in: no key to copy. The agent keeps it fresh on its own.`
        : howToGet(design, i.env) ?? keyHelp(i.env, i.label),
    })),
  };
}

/** Where to get a key, from the provider picked in Agent Design's Tools section. */
function howToGet(design: AgentDesign, env: string): string | undefined {
  for (const s of design.services ?? []) {
    const o = s.options.find((x) => x.key_env === env && x.provider === s.selected) ?? s.options.find((x) => x.key_env === env);
    if (o?.how_to_get) return `${o.provider}: ${o.how_to_get}`;
  }
  return undefined;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await status(params.id));
}

/** Body: { values: { ENV_NAME: "value" } } — empty string clears one. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const values = body?.values && typeof body.values === "object" ? (body.values as Record<string, string>) : {};
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v.trim()]));
  await (await credentialsAdapter(params.id)).save(params.id, clean);
  // New keys reach the Claude / ChatGPT copies' vaults too.
  scheduleHostedSync(params.id);
  return NextResponse.json(await status(params.id));
}

export const POST = attributed(handlePost);
