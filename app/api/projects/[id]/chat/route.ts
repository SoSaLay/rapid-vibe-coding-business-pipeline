import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { getProjectSettings } from "@/lib/store";
import { chatEnv, deployChat, getChat } from "@/lib/agent/chat/app";
import { connectVercel, vercelToken } from "@/lib/agent/chat/vercel";

/** The chat page for the agent on Claude / ChatGPT: whether people can chat with it, what's missing, and where it is. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const platform = (await getProjectSettings(params.id)).agentPlatform;
  if (platform !== "claude" && platform !== "chatgpt") return NextResponse.json({ applicable: false });
  const { auth, authKeys, missing } = await chatEnv(params.id, platform);
  return NextResponse.json({
    applicable: !!auth,
    auth,
    // Labels and where to get them (values never leave the server).
    authKeys: authKeys.map((k) => ({ env: k.env, label: k.label, help: k.help })),
    missing,
    vercelConnected: !!(await vercelToken()),
    chat: await getChat(params.id),
  });
}

/** Body: { action: "connect-vercel", token } | { action: "deploy" } (put it online, or update it). */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "connect-vercel") {
      if (typeof b.token !== "string" || !b.token.trim()) return NextResponse.json({ error: "Paste your Vercel token." }, { status: 400 });
      return NextResponse.json({ ok: true, account: await connectVercel(b.token) });
    }
    if (b.action === "deploy") {
      const platform = (await getProjectSettings(params.id)).agentPlatform;
      if (platform !== "claude" && platform !== "chatgpt") return NextResponse.json({ error: "Pick Claude or ChatGPT in Agent Development first." }, { status: 400 });
      return NextResponse.json({ chat: await deployChat(params.id, platform) });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "That didn't work." }, { status: 500 });
  }
}

export const POST = tracked("deployment", "Putting the chat page online", handlePost);
