/**
 * Build the agent on ChatGPT (OpenAI Agents API): OpenAI runs it in a hosted sandbox.
 *
 *  - The tools (tools.py + SKILL.md) are placed in the sandbox's files; their Python packages preinstalled.
 *  - Keys go in a vault as environment-variable credentials (filled in only on the way to the service's
 *    hosts); sign-ins to MCP servers go in the same vault.
 *  - The sandbox can reach only the tools' hosts.
 *  - The agent is created once and updated after.
 *
 * Uses an OpenAI API key (connected in onboarding or pasted in Development); OpenAI has no sign-in for other apps.
 */

import OpenAI from "openai";
import { readConnectorConfig, saveConnectorConfig } from "../../connectors/config";
import { loadBuild } from "../build-context";
import { bareModel, type PlatformBuild } from "../platforms";
import { mcpService } from "../mcp-catalog";
import { agentGrant } from "../mcp-auth";
import { exampleTasks } from "../../phases/agent-engineering";
import { slugify } from "../../workspace";
import { recordSpend } from "../spend";
import { usageCostUsd } from "../pricing";
import { toolFromCommand, type HostedRun } from "./claude";
import { FIXTURES_PATH, gradeAnswer, hostedBuilds, hostedHosts, hostedInstructions, hostedKeys, hostedLogic, saveHostedBuild, skillDoc, toolsScript } from "./common";

const DASHBOARD = "https://platform.openai.com";

async function openaiKey(): Promise<string | null> {
  return (await readConnectorConfig("ai-openai"))?.apiKey || process.env.OPENAI_API_KEY || null;
}

export async function chatgptConnected(): Promise<boolean> {
  return !!(await openaiKey());
}

/** Save the OpenAI key (the same one the pipeline uses for OpenAI models), after checking it works. */
export async function connectOpenAI(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  await new OpenAI({ apiKey: key }).models.list().catch((e: any) => {
    throw new Error(`OpenAI didn't accept that key: ${e?.message ?? "error"}`);
  });
  const prev = (await readConnectorConfig("ai-openai")) ?? {};
  await saveConnectorConfig("ai-openai", { ...prev, apiKey: key });
}

async function client(): Promise<OpenAI> {
  const key = await openaiKey();
  if (!key) throw new Error("Connect your OpenAI key first.");
  return new OpenAI({ apiKey: key });
}

export async function buildOnChatGPT(projectId: string): Promise<PlatformBuild> {
  const ctx = await loadBuild(projectId);
  const design = ctx.design;
  if (!design) throw new Error("Approve the Agent Design first.");
  if (!design.model.selected.startsWith("openai:")) throw new Error("Pick an OpenAI model in Agent Design to build on ChatGPT.");
  const oa = await client();
  const prev = (await hostedBuilds(projectId)).chatgpt;
  const slug = slugify(ctx.title).slice(0, 40) || "agent";
  const dir = `/workspace/${slug}-tools`;

  const logic = await hostedLogic(projectId);
  const [{ keys, missing }, hosts] = await Promise.all([hostedKeys(projectId, design), hostedHosts(design)]);

  // 1. Keys and sign-ins, in the agent's own vault (rebuilt each time: keys can't be edited in place).
  if (prev?.vault_id) await oa.beta.agents.vaults.delete(prev.vault_id).catch(() => {});
  const vaultId = (await oa.beta.agents.vaults.create({ name: `${ctx.title} keys` } as any)).id;
  for (const [name, value] of Object.entries(keys)) {
    const allowed = hosts.byKey[name]?.length ? hosts.byKey[name] : hosts.all;
    await oa.beta.agents.vaults.credentials.create(vaultId, {
      name,
      auth: {
        type: "environment_variable",
        secret_name: name,
        secret_value: value,
        networking: allowed.length ? { type: "limited", allowed_hosts: allowed } : { type: "unrestricted" },
      },
    });
  }
  const mcp = (design.mcp_servers ?? []).filter((m) => m.transport === "http" && m.url);
  const mcpCredential: Record<string, string> = {};
  for (const m of mcp.filter((m) => m.signin)) {
    const g = await agentGrant(m.name, projectId).catch(() => null);
    if (!g?.access_token) continue;
    const c = await oa.beta.agents.vaults.credentials.create(vaultId, {
      name: `${mcpService(m.name)?.label ?? m.name} sign-in`,
      auth: {
        type: "mcp_oauth",
        mcp_server_url: m.url!,
        access_token: g.access_token,
        ...(g.expires_at ? { expires_at: new Date(g.expires_at).toISOString() } : {}),
        ...(g.refresh_token
          ? {
              refresh: {
                refresh_token: g.refresh_token,
                client_id: g.client_id,
                token_endpoint: g.token_url,
                resource: g.resource,
                token_endpoint_auth: g.client_secret ? { type: "client_secret_post", client_secret: g.client_secret } : { type: "none" },
              },
            }
          : {}),
      },
    } as any);
    mcpCredential[m.name] = c.id;
  }

  // 2. The sandbox: the tools' files, their packages, and only the hosts they call.
  const b64 = (t: string) => Buffer.from(t).toString("base64");
  const envConfig = {
    type: "openai_hosted",
    files: [
      { type: "inline", path: `${dir}/SKILL.md`, data: b64(skillDoc(design, logic, ctx.title, `${slug}-tools`)) },
      { type: "inline", path: `${dir}/tools.py`, data: b64(toolsScript(design, logic)) },
    ],
    packages: { python: logic.extra_dependencies ?? [] },
    network: hosts.all.length ? { access: "restricted", allowed_domains: hosts.all } : { access: "enabled" },
  };
  const environment = await oa.beta.agents.environments.create({ environment: envConfig, vault_ids: [vaultId] } as any);

  // 3. The agent (updated in place when it exists).
  const body = {
    name: ctx.title,
    model: bareModel(design.model.selected),
    instructions: hostedInstructions(design, logic, `the folder ${dir}`),
    tools: mcp.map((m) => ({
      type: "mcp",
      server_label: m.name,
      transport: { type: "http", server_url: m.url },
      ...(mcpCredential[m.name] ? { credential_id: mcpCredential[m.name] } : {}),
      ...(m.allow.length ? { allowed_tools: m.allow } : {}),
    })),
    metadata: { pipeline_project: projectId },
  };
  // Updated in place. Only an agent that no longer exists is replaced with a new one.
  let agent: any = prev?.agent_id ? await oa.beta.agents.update(prev.agent_id, body as any).catch((e: any) => (e?.status === 404 ? null : Promise.reject(e))) : null;
  if (!agent) agent = await oa.beta.agents.create(body as any);

  const build: PlatformBuild = {
    platform: "chatgpt",
    design_version: ctx.designVersion,
    model: design.model.selected,
    agent_id: agent.id,
    environment_id: environment.id,
    vault_id: vaultId,
    env_config: envConfig,
    url: `${DASHBOARD}/agents/${agent.id}`,
    built_at: new Date().toISOString(),
    missing_keys: missing,
  };
  await saveHostedBuild(projectId, build);
  return build;
}

/**
 * One conversation with the ChatGPT agent: each turn in order. With `fixtures`, the sandbox is a copy of the
 * agent's with the case's test data added (tools answer from it; writes don't run).
 */
export async function runOnChatGPT(b: PlatformBuild, turns: string[], fixtures?: Record<string, unknown>): Promise<HostedRun> {
  const oa = await client();
  const withData = fixtures && Object.keys(fixtures).length && b.env_config;
  const env: any = withData
    ? {
        ...b.env_config,
        files: [...((b.env_config as any).files ?? []), { type: "inline", path: FIXTURES_PATH, data: Buffer.from(JSON.stringify(fixtures)).toString("base64") }],
      }
    : { type: "openai_hosted", environment_id: b.environment_id };
  const run: HostedRun = { output: "", session: "", usage: { input_tokens: 0, output_tokens: 0 }, calls: [], tool_errors: 0, latency_s: 0, steps: 0, handed_off: false };
  const started = Date.now();

  const consume = async (stream: any) => {
    // A hard limit even when the stream goes quiet: stop listening after 6 minutes.
    const timer = setTimeout(() => stream.controller?.abort(), 6 * 60_000);
    run.output = "";
    try {
      for await (const ev of stream) {
        if (ev.session_id) run.session = ev.session_id;
        if (ev.type === "agent.session.created") run.session = ev.session?.id ?? run.session;
        if (ev.type === "agent.session.turn.output_text.done") run.output += (run.output ? "\n" : "") + ev.text;
        if (ev.type === "agent.session.turn.item.done") {
          const item = ev.item ?? {};
          if (item.type === "command_execution" || item.type === "mcp_call" || item.type === "function_call") {
            run.steps++;
            const name = item.type === "command_execution" ? toolFromCommand(item.command) : item.name;
            if (name) run.calls.push(name);
            if (/hand_?off/i.test(name ?? "")) run.handed_off = true;
            if ((item.exit_code ?? 0) !== 0 || /^ERROR /m.test(String(item.output ?? ""))) run.tool_errors++;
          }
        }
        if (ev.type === "agent.session.turn.completed" || ev.type === "agent.session.turn.failed" || ev.type === "agent.session.turn.cancelled") {
          run.usage.input_tokens += ev.usage?.input_tokens ?? 0;
          run.usage.output_tokens += ev.usage?.output_tokens ?? 0;
          if (ev.type === "agent.session.turn.failed") run.output ||= "(the run failed)";
        }
        if (ev.type === "agent.session.idle") break;
      }
    } catch (e) {
      if (!stream.controller?.signal?.aborted) throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  await consume(
    await oa.beta.agents.sessions.create({
      agent_id: b.agent_id,
      environment: env,
      ...(b.vault_id ? { vault_ids: [b.vault_id] } : {}),
      input: turns[0] ?? "",
      stream: true,
      // Our own test runs: left out of Operations' numbers.
      metadata: { source: "pipeline-test" },
    } as any),
  );
  for (const text of turns.slice(1)) {
    if (!run.session) break;
    await consume(oa.beta.agents.sessions.stream(run.session, { input: text } as any));
  }
  run.latency_s = Math.round((Date.now() - started) / 100) / 10;
  if (run.session) run.session_url = `${DASHBOARD}/logs/${run.session}`;
  return run;
}

export async function testOnChatGPT(projectId: string, limit = 3): Promise<PlatformBuild> {
  const b = (await hostedBuilds(projectId)).chatgpt;
  if (!b) throw new Error("Build it on ChatGPT first.");
  const ctx = await loadBuild(projectId);
  const tasks = exampleTasks(ctx.spec ?? {}).slice(0, limit);
  const cases = await Promise.all(
    tasks.map(async (t) => {
      try {
        const r = await runOnChatGPT(b, [t.input]);
        await recordSpend(projectId, "ChatGPT-hosted test", usageCostUsd(b.model, r.usage));
        const g = await gradeAnswer(t.input, t.expected, r.output);
        return { input: t.input, output: r.output.slice(0, 2000), ok: g.ok, reason: g.reason, ...(r.session_url ? { session_url: r.session_url } : {}) };
      } catch (e: any) {
        return { input: t.input, output: "", ok: false, reason: e?.message || "The run failed." };
      }
    }),
  );
  const next: PlatformBuild = { ...b, test: { at: new Date().toISOString(), ok: cases.length > 0 && cases.every((c) => c.ok), cases } };
  await saveHostedBuild(projectId, next);
  return next;
}
