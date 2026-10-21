/**
 * The agent's chat page: a small sign-in-protected web app (templates/agent-chat) where people talk to the
 * agent on Claude or ChatGPT. Generated into the agent's folder (chat/), configured with environment
 * variables, and put online on Vercel. Each person sees only their own conversations; the platform key stays
 * on the server.
 */

import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, savePhaseState } from "../../store";
import { loadBuild } from "../build-context";
import { credentialsAdapter } from "../registry";
import { readConnectorConfig } from "../../connectors/config";
import { hostedBuilds } from "../hosted/common";
import { slugify } from "../../workspace";
import { deployToVercel, vercelToken } from "./vercel";

const TEMPLATE = path.join(process.cwd(), "templates", "agent-chat");

export type ChatAuth = "clerk" | "supabase";

export interface ChatState {
  platform: "claude" | "chatgpt";
  url?: string;
  vercel_project?: string;
  deployed_at?: string;
  error?: string;
}

/** The keys each sign-in option needs (saved with the agent's other keys). */
export const AUTH_KEYS: Record<ChatAuth, { env: string; label: string; help: string }[]> = {
  clerk: [
    { env: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", label: "Clerk publishable key", help: "dashboard.clerk.com → your app → API keys" },
    { env: "CLERK_SECRET_KEY", label: "Clerk secret key", help: "dashboard.clerk.com → your app → API keys" },
  ],
  supabase: [
    { env: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase project URL", help: "supabase.com → your project → Project Settings → API" },
    { env: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anon key", help: "supabase.com → your project → Project Settings → API" },
  ],
};

/** Which sign-in the chat page uses, from Agent Design's "Who uses it" (null = nobody chats with it). */
export async function chatAuth(projectId: string): Promise<ChatAuth | null> {
  const login = (await loadBuild(projectId)).design?.login?.selected;
  return login === "clerk" ? "clerk" : login === "supabase-auth" ? "supabase" : null;
}

export async function getChat(projectId: string): Promise<ChatState | null> {
  return (await getPhaseState<{ chat?: ChatState }>(projectId, "engineering"))?.chat ?? null;
}
async function saveChat(projectId: string, chat: ChatState) {
  const s = (await getPhaseState<any>(projectId, "engineering")) ?? {};
  await savePhaseState(projectId, "engineering", { ...s, chat });
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".env", ".env.local"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p));
  }
  return out;
}

/** What the chat page needs to run (its settings), and which of them are still missing. */
export async function chatEnv(projectId: string, platform: "claude" | "chatgpt") {
  const ctx = await loadBuild(projectId);
  const auth = await chatAuth(projectId);
  const b = (await hostedBuilds(projectId))[platform];
  const creds = await (await credentialsAdapter(projectId)).envFor(projectId);
  const platformKey =
    platform === "claude"
      ? (await readConnectorConfig("ai-anthropic"))?.apiKey || process.env.ANTHROPIC_API_KEY
      : (await readConnectorConfig("ai-openai"))?.apiKey || process.env.OPENAI_API_KEY;
  const env: Record<string, string> = {
    PLATFORM: platform,
    NEXT_PUBLIC_AUTH: auth ?? "clerk",
    NEXT_PUBLIC_AGENT_TITLE: ctx.title,
    AGENT_ID: b?.agent_id ?? "",
    ENVIRONMENT_ID: b?.environment_id ?? "",
    VAULT_ID: b?.vault_id ?? "",
    [platform === "claude" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"]: platformKey ?? "",
  };
  const authKeys = auth ? AUTH_KEYS[auth] : [];
  for (const k of authKeys) env[k.env] = creds[k.env] || process.env[k.env] || "";
  const missing = [
    ...(!b ? [`build it on ${platform === "claude" ? "Claude" : "ChatGPT"}`] : []),
    ...(!platformKey ? [platform === "claude" ? "Anthropic key" : "OpenAI key"] : []),
    ...authKeys.filter((k) => !env[k.env]).map((k) => k.label),
  ];
  return { env, missing, auth, authKeys };
}

/** Write the chat page into the agent's folder (chat/), with its settings in .env.local for running it locally. */
export async function writeChatApp(projectId: string, platform: "claude" | "chatgpt"): Promise<string> {
  const ctx = await loadBuild(projectId);
  const dir = path.join(ctx.dir, "chat");
  for (const f of await walk(TEMPLATE)) {
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.copyFile(path.join(TEMPLATE, f), path.join(dir, f));
  }
  const { env } = await chatEnv(projectId, platform);
  await fs.writeFile(path.join(dir, ".env.local"), Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  return dir;
}

/** Put the chat page online (or update it) for the agent on Claude / ChatGPT. */
export async function deployChat(projectId: string, platform: "claude" | "chatgpt"): Promise<ChatState> {
  if (!(await chatAuth(projectId))) throw new Error("Agent Design says nobody chats with this agent (it runs on its own), so there's no chat page.");
  if (!(await vercelToken())) throw new Error("Connect Vercel first.");
  const { env, missing } = await chatEnv(projectId, platform);
  if (missing.length) throw new Error(`Still needed: ${missing.join(", ")}.`);
  const ctx = await loadBuild(projectId);
  const dir = await writeChatApp(projectId, platform);
  const files = await Promise.all((await walk(dir)).map(async (f) => ({ file: f, data: await fs.readFile(path.join(dir, f), "utf8") })));
  const name = `${slugify(ctx.title).slice(0, 40) || "agent"}-chat`;
  try {
    const r = await deployToVercel(name, files, env);
    const chat: ChatState = { platform, url: r.url, vercel_project: r.project, deployed_at: new Date().toISOString() };
    await saveChat(projectId, chat);
    return chat;
  } catch (e: any) {
    const prev = await getChat(projectId);
    await saveChat(projectId, { ...(prev ?? { platform }), platform, error: e?.message ?? "Couldn't put it online." });
    throw e;
  }
}
