import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState } from "@/lib/store";
import type { AgentDesign, McpServer } from "@/lib/agent/design";
import { approveDesign } from "@/lib/agent/apply-change";
import { startAutoflow } from "@/lib/agent/autoflow";
import { mcpEnvPrefix, mcpService, mcpServiceFor } from "@/lib/agent/mcp-catalog";
import { forgetAgentGrant, mcpToken } from "@/lib/agent/mcp-auth";

/**
 * Use a service through its official MCP server with a sign-in, instead of a pasted key (or switch back).
 * Body: { service: <catalog id>, on: boolean }. Turning it on (after the sign-in popup): the tools that needed
 * that service's key are turned off and the MCP server is added; off: the reverse. Either way the design is
 * re-approved and, for a built agent, rebuilt and re-tested in the background.
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const svc = mcpService(String(body.service ?? ""));
  if (!svc) return NextResponse.json({ error: "That service has no sign-in." }, { status: 400 });
  const state = await getPhaseState<{ design: AgentDesign }>(params.id, "agent-design");
  if (!state?.design) return NextResponse.json({ error: "Design the agent first." }, { status: 400 });
  const d = state.design;
  const servers = d.mcp_servers ?? [];
  let design: AgentDesign;

  if (body.on) {
    if (!(await mcpToken(svc.id, params.id))) return NextResponse.json({ error: `Sign in to ${svc.label} first.` }, { status: 400 });
    const replaces = d.tools.filter((t) => t.enabled && t.credential_env && mcpServiceFor(t.credential_env, t.credential_label, t.integration)?.id === svc.id).map((t) => t.name);
    const server: McpServer = {
      name: svc.id,
      transport: "http",
      url: svc.url,
      token_env: `${mcpEnvPrefix(svc.id)}_TOKEN`,
      // Its tools are new to the agent: it asks you before any of them runs until you say otherwise (Agent Design → MCP servers).
      approval: true,
      allow: [],
      signin: true,
      replaces,
    };
    design = {
      ...d,
      tools: d.tools.map((t) => (replaces.includes(t.name) ? { ...t, enabled: false } : t)),
      mcp_servers: [...servers.filter((s) => s.name !== svc.id), server],
    };
  } else {
    const was = servers.find((s) => s.name === svc.id);
    design = {
      ...d,
      tools: d.tools.map((t) => (was?.replaces?.includes(t.name) ? { ...t, enabled: true } : t)),
      mcp_servers: servers.filter((s) => s.name !== svc.id),
    };
    await forgetAgentGrant(svc.id, params.id);
  }

  const version = await approveDesign(params.id, design);
  const built = (await getPhaseState<any>(params.id, "engineering"))?.agentBuild;
  if (built) startAutoflow(params.id, req.nextUrl.origin, version);
  return NextResponse.json({ ok: true, version, rebuilding: !!built });
}

export const POST = attributed(handlePost);
