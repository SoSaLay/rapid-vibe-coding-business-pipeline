/**
 * Operations for an agent on Claude or ChatGPT: how it's doing, straight from the platform's records of its
 * conversations (sessions). The pipeline's own test and evaluation runs are left out (they're tagged
 * `source: pipeline-test`, or titled "Test:" / "Eval " from before the tag existed).
 *
 * Runs, speed and cost come from every conversation in the period; tool calls, tool errors, hand-offs and
 * approval waits need each conversation's steps, so those are read for the most recent STEP_SAMPLE runs.
 */

import { hostedBuilds } from "./common";
import { usageCostUsd } from "../pricing";
import { readConnectorConfig } from "../../connectors/config";
import { claudeClient, toolFromCommand } from "./claude";

const STEP_SAMPLE = 50;
const MAX_RUNS = 500;

export interface HostedOpsSummary {
  platform: "claude" | "chatgpt";
  days: number;
  runs: number;
  /** Runs whose steps were read (tool calls, errors, hand-offs, waits); equals runs unless there were many. */
  sampled: number;
  latency_p50: number | null;
  latency_p95: number | null;
  cost: number | null;
  cost_per_run: number | null;
  handoffs: number;
  awaiting_approval: number;
  tool_error_runs: number;
  avg_tool_calls: number | null;
  /** Where to see the agent and its conversations on the platform (and change or delete it there). */
  agent_url?: string;
  agent_id: string;
  agent_version?: number | string;
  model: string;
  built_at: string;
}

const isTest = (title: string | null | undefined, metadata: Record<string, string> | null | undefined) =>
  metadata?.source === "pipeline-test" || /^(Test:|Eval )/.test(title ?? "");

function pct(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export async function hostedOps(projectId: string, platform: "claude" | "chatgpt", days: number): Promise<HostedOpsSummary> {
  const b = (await hostedBuilds(projectId))[platform];
  if (!b) throw new Error(`Build it on ${platform === "claude" ? "Claude" : "ChatGPT"} first.`);
  const since = Date.now() - days * 86_400_000;
  const base = { platform, days, agent_url: b.url, agent_id: b.agent_id, agent_version: b.agent_version, model: b.model, built_at: b.built_at };

  if (platform === "claude") {
    const client = await claudeClient();
    const sessions: any[] = [];
    for await (const s of client.beta.sessions.list({ agent_id: b.agent_id, "created_at[gte]": new Date(since).toISOString(), order: "desc" } as any) as any) {
      if (!isTest(s.title, s.metadata)) sessions.push(s);
      if (sessions.length >= MAX_RUNS) break;
    }
    const secs = sessions.map((s) => s.stats?.active_seconds ?? s.stats?.duration_seconds).filter((x): x is number => typeof x === "number");
    const costs = sessions.map((s) =>
      usageCostUsd(b.model, {
        input_tokens: (s.usage?.input_tokens ?? 0) + (s.usage?.cache_read_input_tokens ?? 0),
        output_tokens: s.usage?.output_tokens ?? 0,
        cache_read: s.usage?.cache_read_input_tokens ?? 0,
      }),
    );
    const cost = costs.every((c) => c !== null) ? (costs as number[]).reduce((a, c) => a + c, 0) : null;
    // Steps of the most recent runs.
    const sample = sessions.slice(0, STEP_SAMPLE);
    let handoffs = 0, waiting = 0, errorRuns = 0, toolCalls = 0;
    await Promise.all(
      sample.map(async (s) => {
        const events: any[] = [];
        for await (const e of client.beta.sessions.events.list(s.id) as any) events.push(e);
        let calls = 0, errors = 0, handedOff = false, lastIdle: any = null;
        for (const e of events) {
          if (e.type === "agent.tool_use" || e.type === "agent.mcp_tool_use") {
            calls++;
            const name = e.type === "agent.mcp_tool_use" ? e.name : toolFromCommand(e.input?.command ?? "");
            if (/hand_?off/i.test(name ?? "")) handedOff = true;
          }
          if ((e.type === "agent.tool_result" || e.type === "agent.mcp_tool_result") && (e.is_error || /^ERROR /m.test(JSON.stringify(e.content ?? "")))) errors++;
          if (e.type === "session.status_idle") lastIdle = e;
        }
        toolCalls += calls;
        if (errors) errorRuns++;
        if (handedOff) handoffs++;
        if (lastIdle?.stop_reason?.type === "requires_action") waiting++;
      }),
    );
    return {
      ...base,
      runs: sessions.length,
      sampled: sample.length,
      latency_p50: pct(secs, 50),
      latency_p95: pct(secs, 95),
      cost,
      cost_per_run: cost !== null && sessions.length ? cost / sessions.length : null,
      handoffs,
      awaiting_approval: waiting,
      tool_error_runs: errorRuns,
      avg_tool_calls: sample.length ? toolCalls / sample.length : null,
    };
  }

  // ChatGPT
  const key = (await readConnectorConfig("ai-openai"))?.apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Connect your OpenAI key first.");
  const OpenAI = (await import("openai")).default;
  const oa = new OpenAI({ apiKey: key });
  const sessions: any[] = [];
  for await (const s of oa.beta.agents.sessions.list({ agent_id: b.agent_id, order: "desc" } as any) as any) {
    if (s.created_at * 1000 < since) break;
    if (!isTest(null, s.metadata)) sessions.push(s);
    if (sessions.length >= MAX_RUNS) break;
  }
  const secs = sessions.map((s) => (s.last_active_at && s.created_at ? s.last_active_at - s.created_at : null)).filter((x): x is number => x !== null && x >= 0);
  const costs = sessions.map((s) => usageCostUsd(b.model, { input_tokens: s.usage?.input_tokens ?? 0, output_tokens: s.usage?.output_tokens ?? 0 }));
  const cost = costs.every((c) => c !== null) ? (costs as number[]).reduce((a, c) => a + c, 0) : null;
  const sample = sessions.slice(0, STEP_SAMPLE);
  let handoffs = 0, errorRuns = 0, toolCalls = 0;
  await Promise.all(
    sample.map(async (s) => {
      const items: any[] = [];
      for await (const it of (oa.beta.agents.sessions as any).items.list(s.id) as any) items.push(it);
      let calls = 0, errors = 0, handedOff = false;
      for (const it of items) {
        if (it.type !== "command_execution" && it.type !== "mcp_call" && it.type !== "function_call") continue;
        calls++;
        const name = it.type === "command_execution" ? toolFromCommand(it.command) : it.name;
        if (/hand_?off/i.test(name ?? "")) handedOff = true;
        if ((it.exit_code ?? 0) !== 0 || /^ERROR /m.test(String(it.output ?? ""))) errors++;
      }
      toolCalls += calls;
      if (errors) errorRuns++;
      if (handedOff) handoffs++;
    }),
  );
  return {
    ...base,
    runs: sessions.length,
    sampled: sample.length,
    latency_p50: pct(secs, 50),
    latency_p95: pct(secs, 95),
    cost,
    cost_per_run: cost !== null && sessions.length ? cost / sessions.length : null,
    handoffs,
    awaiting_approval: sessions.filter((s) => s.status === "requires_action").length,
    tool_error_runs: errorRuns,
    avg_tool_calls: sample.length ? toolCalls / sample.length : null,
  };
}
