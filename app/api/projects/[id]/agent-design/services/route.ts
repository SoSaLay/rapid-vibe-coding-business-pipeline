import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState, latestArtifact, savePhaseState } from "@/lib/store";
import type { AgentDesign } from "@/lib/agent/design";
import { proposeServices, specToAgentText } from "@/lib/phases/agent-design";

/**
 * Provider options for the services the agent needs keys for, for designs made before they existed (or a
 * service added since). Only fills in what's missing; it changes no tool, so the design stays approved.
 */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<{ design: AgentDesign } & Record<string, any>>(params.id, "agent-design");
  if (!state?.design) return NextResponse.json({ error: "Design the agent first." }, { status: 400 });
  const d = state.design;
  const have = new Set((d.services ?? []).map((s) => s.key_env));
  const missing = d.tools.filter((t) => t.enabled && t.credential_env && !have.has(t.credential_env));
  if (!missing.length) return NextResponse.json({ services: d.services ?? [] });
  const spec = (await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any> | undefined;
  try {
    const found = await proposeServices({ ...d, tools: missing }, spec ? specToAgentText(spec) : "");
    const services = [...(d.services ?? []), ...found];
    await savePhaseState(params.id, "agent-design", { ...state, design: { ...d, services } });
    return NextResponse.json({ services });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't find options." }, { status: 500 });
  }
}

export const POST = attributed(handlePost);
