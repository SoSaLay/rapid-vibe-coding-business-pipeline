/**
 * Talks to the agent where it runs (Claude or ChatGPT), on behalf of one signed-in person. Server-side only:
 * the platform key never reaches the browser.
 *
 * Every conversation is tagged with the person's id when it starts, and every later call checks that tag, so
 * people only ever see and continue their own conversations.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "approval"; id: string; tool: string; detail: string }
  | { type: "done"; conversation: string }
  | { type: "error"; message: string };

export interface Conversation {
  id: string;
  title: string;
  at: string;
}

export interface Message {
  role: "user" | "assistant";
  text: string;
}

const PLATFORM = process.env.PLATFORM === "chatgpt" ? "chatgpt" : "claude";
const AGENT_ID = process.env.AGENT_ID!;
const AGENT_VERSION = process.env.AGENT_VERSION ? Number(process.env.AGENT_VERSION) : undefined;
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID!;
const VAULT_IDS = process.env.VAULT_ID ? [process.env.VAULT_ID] : [];

const claude = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const titleOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 60) || "New conversation";

/** The conversation, if it belongs to this person (else null). */
async function owned(userId: string, id: string): Promise<any | null> {
  const s: any = PLATFORM === "claude" ? await claude().beta.sessions.retrieve(id).catch(() => null) : await openai().beta.agents.sessions.retrieve(id).catch(() => null);
  return s && s.metadata?.user_id === userId ? s : null;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const out: Conversation[] = [];
  if (PLATFORM === "claude") {
    for await (const s of claude().beta.sessions.list({ agent_id: AGENT_ID, order: "desc" } as any) as any) {
      if (s.metadata?.user_id === userId) out.push({ id: s.id, title: s.title || "Conversation", at: s.created_at });
      if (out.length >= 50) break;
    }
  } else {
    for await (const s of openai().beta.agents.sessions.list({ agent_id: AGENT_ID, order: "desc" } as any) as any) {
      if (s.metadata?.user_id === userId) out.push({ id: s.id, title: s.metadata?.title || "Conversation", at: new Date(s.created_at * 1000).toISOString() });
      if (out.length >= 50) break;
    }
  }
  return out;
}

export async function history(userId: string, id: string): Promise<Message[] | null> {
  if (!(await owned(userId, id))) return null;
  const out: Message[] = [];
  if (PLATFORM === "claude") {
    for await (const e of claude().beta.sessions.events.list(id) as any) {
      const text = (e.content ?? []).map((c: any) => c.text ?? "").join("");
      if (e.type === "user.message" && text) out.push({ role: "user", text });
      if (e.type === "agent.message" && text) out.push({ role: "assistant", text });
    }
  } else {
    for await (const it of openai().beta.agents.sessions.items.list(id) as any) {
      if (it.type !== "message" || it.phase === "commentary") continue;
      const text = (it.content ?? []).map((c: any) => c.text ?? "").join("");
      if (text) out.push({ role: it.role === "user" ? "user" : "assistant", text });
    }
  }
  return out;
}

/** Send a message (starting a conversation when `id` is null) and stream the agent's reply. */
export async function* send(userId: string, id: string | null, text: string): AsyncGenerator<ChatEvent> {
  if (id && !(await owned(userId, id))) {
    yield { type: "error", message: "That conversation isn't yours." };
    return;
  }
  yield* PLATFORM === "claude" ? sendClaude(userId, id, text) : sendOpenAI(userId, id, text);
}

/** Answer an approval the agent paused for, then stream the rest of its reply. */
export async function* approve(userId: string, id: string, toolUseId: string, allow: boolean): AsyncGenerator<ChatEvent> {
  if (PLATFORM !== "claude" || !(await owned(userId, id))) {
    yield { type: "error", message: "That conversation isn't yours." };
    return;
  }
  const c = claude();
  const stream: any = await c.beta.sessions.events.stream(id);
  await c.beta.sessions.events.send(id, { events: [{ type: "user.tool_confirmation", tool_use_id: toolUseId, result: allow ? "allow" : "deny" }] } as any);
  yield* readClaude(c, stream, id);
}

async function* sendClaude(userId: string, id: string | null, text: string): AsyncGenerator<ChatEvent> {
  const c = claude();
  if (!id) {
    const s: any = await c.beta.sessions.create({
      agent: AGENT_VERSION ? { type: "agent", id: AGENT_ID, version: AGENT_VERSION } : AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      ...(VAULT_IDS.length ? { vault_ids: VAULT_IDS } : {}),
      title: titleOf(text),
      metadata: { user_id: userId, source: "chat" },
    } as any);
    id = s.id as string;
  }
  const stream: any = await c.beta.sessions.events.stream(id);
  await c.beta.sessions.events.send(id, { events: [{ type: "user.message", content: [{ type: "text", text }] }] } as any);
  yield* readClaude(c, stream, id);
}

async function* readClaude(c: Anthropic, stream: any, id: string): AsyncGenerator<ChatEvent> {
  const timer = setTimeout(() => stream.controller?.abort(), 10 * 60_000);
  try {
    for await (const e of stream) {
      if (e.type === "agent.message") {
        const t = (e.content ?? []).map((x: any) => x.text ?? "").join("");
        if (t) yield { type: "text", text: t };
      } else if ((e.type === "agent.tool_use" || e.type === "agent.mcp_tool_use") && e.evaluated_permission === "ask") {
        // Paused for this person's yes or no.
        yield { type: "approval", id: e.id, tool: e.name ?? "a tool", detail: JSON.stringify(e.input ?? {}).slice(0, 400) };
        yield { type: "done", conversation: id };
        return;
      } else if (e.type === "session.error") {
        yield { type: "error", message: e.error?.message ?? "Something went wrong." };
      } else if ((e.type === "session.status_idle" && e.stop_reason?.type !== "requires_action") || e.type === "session.status_terminated") {
        break;
      }
    }
  } catch (e) {
    if (!stream.controller?.signal?.aborted) throw e;
  } finally {
    clearTimeout(timer);
    stream.controller?.abort();
  }
  yield { type: "done", conversation: id };
}

async function* sendOpenAI(userId: string, id: string | null, text: string): AsyncGenerator<ChatEvent> {
  const oa = openai();
  const stream: any = id
    ? oa.beta.agents.sessions.stream(id, { input: text } as any)
    : await oa.beta.agents.sessions.create({
        agent_id: AGENT_ID,
        environment: { type: "openai_hosted", environment_id: ENVIRONMENT_ID },
        ...(VAULT_IDS.length ? { vault_ids: VAULT_IDS } : {}),
        input: text,
        stream: true,
        metadata: { user_id: userId, source: "chat", title: titleOf(text) },
      } as any);
  let session = id ?? "";
  const timer = setTimeout(() => stream.controller?.abort(), 10 * 60_000);
  try {
    for await (const e of stream) {
      if (e.session_id) session = e.session_id;
      if (e.type === "agent.session.created") session = e.session?.id ?? session;
      if (e.type === "agent.session.turn.output_text.delta" && e.delta) yield { type: "text", text: e.delta };
      if (e.type === "agent.session.turn.failed") yield { type: "error", message: "The agent couldn't finish that." };
      if (e.type === "agent.session.idle") break;
    }
  } catch (e) {
    if (!stream.controller?.signal?.aborted) throw e;
  } finally {
    clearTimeout(timer);
  }
  yield { type: "done", conversation: session };
}
