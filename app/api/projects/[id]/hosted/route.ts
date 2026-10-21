import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { completePhase, getProjectSettings, saveArtifact, saveProjectSettings } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { hostedBuilds, saveHostedBuild } from "@/lib/agent/hosted/common";
import { hostedFingerprint, syncHosted } from "@/lib/agent/hosted/sync";
import { buildOnClaude, claudeConnected, testOnClaude } from "@/lib/agent/hosted/claude";
import { buildOnChatGPT, chatgptConnected, connectOpenAI, testOnChatGPT } from "@/lib/agent/hosted/chatgpt";
import { budgetMessage, spendStatus } from "@/lib/agent/spend";

/** The agent's builds on Claude and ChatGPT, whether each platform is connected, and the model in Agent Design. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const builds = await hostedBuilds(params.id);
  return NextResponse.json({
    builds,
    // The path picked in Development (Evaluations and Deployment show only that one).
    chosen: (await getProjectSettings(params.id)).agentPlatform ?? (ctx.build ? "self" : (Object.keys(builds)[0] ?? "self")),
    connected: { claude: await claudeConnected(), chatgpt: await chatgptConnected() },
    model: ctx.design?.model.selected ?? null,
    designVersion: ctx.designVersion,
    // Built our way too (a local build exists).
    ourWay: !!ctx.build,
  });
}

/**
 * Body: { platform: "claude" | "chatgpt", action: "build" | "test" | "connect" | "complete", apiKey?, force? }.
 * build = create or update the agent on that platform; test = run the example tasks there; connect = save an
 * OpenAI key; complete = finish Development with this build and open Evaluations.
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  if (b.action === "choose") {
    if (!["self", "claude", "chatgpt"].includes(b.platform)) return NextResponse.json({ error: "Which path?" }, { status: 400 });
    await saveProjectSettings(params.id, { agentPlatform: b.platform });
    return NextResponse.json({ ok: true });
  }
  const platform = b.platform === "chatgpt" ? "chatgpt" : b.platform === "claude" ? "claude" : null;
  if (!platform) return NextResponse.json({ error: "Which platform?" }, { status: 400 });
  try {
    if (b.action === "connect") {
      if (platform !== "chatgpt" || typeof b.apiKey !== "string") return NextResponse.json({ error: "Paste your OpenAI API key." }, { status: 400 });
      await connectOpenAI(b.apiKey);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "build") {
      const prev = (await hostedBuilds(params.id))[platform];
      const built = platform === "claude" ? await buildOnClaude(params.id) : await buildOnChatGPT(params.id);
      // Remember what it was built from, so later changes update it (and unchanged ones don't re-upload it).
      const build = { ...built, test: prev?.test, synced_fp: await hostedFingerprint(params.id) };
      await saveHostedBuild(params.id, build);
      return NextResponse.json({ build });
    }
    if (b.action === "sync") {
      // Bring this copy up to date now (it also happens on its own after every change).
      const result = await syncHosted(params.id, { only: platform });
      return NextResponse.json({ result: result[platform] ?? "not built", build: (await hostedBuilds(params.id))[platform] });
    }
    if (b.action === "complete") {
      // Move on to Evaluations with the agent built on this platform (the owner saw any warnings first).
      const build = (await hostedBuilds(params.id))[platform];
      if (!build) return NextResponse.json({ error: "Build it first." }, { status: 400 });
      const ctx = await loadBuild(params.id);
      await saveArtifact({
        projectId: params.id,
        phase: "engineering",
        artifactType: "build-manifest",
        payload: {
          kind: "agent",
          platform,
          agent_id: build.agent_id,
          model: build.model,
          url: build.url,
          tests: build.test ?? null,
          missing_keys: build.missing_keys ?? [],
          forced: !build.test?.ok,
        },
        inputs: [`agent-design@${build.design_version}`, "product-spec"],
      });
      const project = ctx.project?.phase_status.engineering === "complete" ? ctx.project : await completePhase(params.id, "engineering");
      await saveProjectSettings(params.id, { agentPlatform: platform });
      return NextResponse.json({ ok: true, project });
    }
    if (b.action === "test") {
      const budget = await spendStatus(params.id);
      if (budget.over_budget && !b.force) return NextResponse.json({ error: budgetMessage(budget), over_budget: true }, { status: 402 });
      const build = platform === "claude" ? await testOnClaude(params.id) : await testOnChatGPT(params.id);
      return NextResponse.json({ build });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "That didn't work." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Working on the hosted agent", handlePost);
