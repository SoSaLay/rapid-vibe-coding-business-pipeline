/**
 * Build the agent on Claude (Anthropic Managed Agents): Anthropic runs it and hosts a sandbox per conversation.
 *
 *  - The tools become a custom skill (SKILL.md + tools.py) the agent runs with bash in its sandbox.
 *  - Keys go in a vault as environment-variable credentials: the sandbox only sees a placeholder, and the
 *    real key is filled in when a request leaves for that service's own hosts.
 *  - Services the owner signed in to through MCP go in the same vault (Anthropic refreshes those tokens).
 *  - The agent is created once and updated after (each update is a new version on Anthropic's side).
 *
 * Uses the pipeline's own Anthropic key (connected in onboarding): nothing else to set up.
 */

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { readConnectorConfig } from "../../connectors/config";
import { loadBuild } from "../build-context";
import { bareModel, type PlatformBuild } from "../platforms";
import { mcpService } from "../mcp-catalog";
import { agentGrant } from "../mcp-auth";
import { exampleTasks } from "../../phases/agent-engineering";
import { slugify } from "../../workspace";
import { recordSpend } from "../spend";
import { usageCostUsd } from "../pricing";
import { FIXTURES_PATH, gradeAnswer, hostedBuilds, hostedHosts, hostedInstructions, hostedKeys, hostedLogic, saveHostedBuild, skillDoc, toolsScript } from "./common";

const CONSOLE = "https://platform.claude.com/workspaces/default";

export async function claudeClient(): Promise<Anthropic> {
  const key = (await readConnectorConfig("ai-anthropic"))?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Connect your Anthropic key first (onboarding).");
  return new Anthropic({ apiKey: key });
}

export async function claudeConnected(): Promise<boolean> {
  return !!((await readConnectorConfig("ai-anthropic"))?.apiKey || process.env.ANTHROPIC_API_KEY);
}

/** Create or update everything on Anthropic's side for the approved design. */
export async function buildOnClaude(projectId: string): Promise<PlatformBuild> {
  const ctx = await loadBuild(projectId);
  const design = ctx.design;
  if (!design) throw new Error("Approve the Agent Design first.");
  if (!design.model.selected.startsWith("anthropic:")) throw new Error("Pick a Claude model in Agent Design to build on Claude.");
  const client = await claudeClient();
  const prev = (await hostedBuilds(projectId)).claude;
  const slug = slugify(ctx.title).slice(0, 40) || "agent";
  const skillName = `${slug}-tools`;

  const logic = await hostedLogic(projectId);
  const [{ keys, missing }, hosts] = await Promise.all([hostedKeys(projectId, design), hostedHosts(design)]);

  // 1. The tools, as a skill (a new version when it exists).
  const files = [
    await toFile(Buffer.from(skillDoc(design, logic, ctx.title, skillName)), `${skillName}/SKILL.md`),
    await toFile(Buffer.from(toolsScript(design, logic)), `${skillName}/tools.py`),
  ];
  let skillId = prev?.skill_id;
  if (skillId) {
    await client.beta.skills.versions.create(skillId, { files } as any).catch(async () => {
      skillId = undefined; // deleted on Anthropic's side: make a new one
    });
  }
  if (!skillId) skillId = (await client.beta.skills.create({ display_title: `${ctx.title} tools`, files } as any)).id;

  // 2. The sandbox: reaches only the tools' hosts (plus package installs and MCP servers).
  const environment = await client.beta.environments.create({
    name: `${slug}-${Date.now().toString(36)}`,
    config: {
      type: "cloud",
      networking: { type: "limited", allow_package_managers: true, allow_mcp_servers: true, allowed_hosts: hosts.all },
    },
  } as any);

  // 3. Keys and sign-ins, in the agent's own vault.
  let vaultId = prev?.vault_id;
  if (vaultId) await client.beta.vaults.retrieve(vaultId).catch(() => (vaultId = undefined));
  if (!vaultId) vaultId = (await client.beta.vaults.create({ display_name: `${ctx.title} keys` } as any)).id;
  const existing: any[] = [];
  for await (const c of client.beta.vaults.credentials.list(vaultId) as any) existing.push(c);
  const replace = async (match: (c: any) => boolean, body: any) => {
    for (const c of existing.filter(match)) await (client.beta.vaults.credentials as any).delete(c.id, { vault_id: vaultId }).catch(() => {});
    await client.beta.vaults.credentials.create(vaultId!, body);
  };
  for (const [name, value] of Object.entries(keys)) {
    const allowed = hosts.byKey[name]?.length ? hosts.byKey[name] : hosts.all;
    await replace((c) => c.auth?.secret_name === name, {
      display_name: name,
      auth: {
        type: "environment_variable",
        secret_name: name,
        secret_value: value,
        networking: allowed.length ? { type: "limited", allowed_hosts: allowed } : { type: "unrestricted" },
      },
    });
  }
  const mcp = (design.mcp_servers ?? []).filter((m) => m.transport === "http" && m.url);
  for (const m of mcp.filter((m) => m.signin)) {
    const g = await agentGrant(m.name, projectId).catch(() => null);
    if (!g?.access_token) continue;
    await replace((c) => c.auth?.mcp_server_url === m.url, {
      display_name: `${mcpService(m.name)?.label ?? m.name} sign-in`,
      auth: {
        type: "mcp_oauth",
        mcp_server_url: m.url,
        access_token: g.access_token,
        ...(g.expires_at ? { expires_at: new Date(g.expires_at).toISOString() } : {}),
        ...(g.refresh_token
          ? {
              refresh: {
                refresh_token: g.refresh_token,
                client_id: g.client_id,
                token_endpoint: g.token_url,
                token_endpoint_auth: g.client_secret ? { type: "client_secret_post", client_secret: g.client_secret } : { type: "none" },
              },
            }
          : {}),
      },
    });
  }

  // 4. The agent (updated in place when it exists: a new version).
  const body = {
    name: ctx.title,
    model: bareModel(design.model.selected),
    system: hostedInstructions(design, logic, `the "${skillName}" skill`),
    skills: [{ type: "custom", skill_id: skillId, version: "latest" }],
    mcp_servers: mcp.map((m) => ({ type: "url", name: m.name, url: m.url })),
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: { enabled: true, permission_policy: { type: "auto" } },
        // The tools call their own APIs; the open web stays off unless the design needs it.
        configs: [
          { name: "web_fetch", enabled: false },
          { name: "web_search", enabled: false },
        ],
      },
      ...mcp.map((m) => ({ type: "mcp_toolset", mcp_server_name: m.name, default_config: { permission_policy: { type: m.approval ? "always_ask" : "always_allow" } } })),
    ],
    metadata: { pipeline_project: projectId },
  };
  // "auto" lets Anthropic judge each call's risk; an account without it gets "always allow" (the skill's rules still ask first).
  const plain = JSON.parse(JSON.stringify(body).replace(/\{"type":"auto"\}/g, '{"type":"always_allow"}'));
  const save = async (b: any): Promise<any> => {
    if (prev?.agent_id) {
      // Updated in place (a new version). Only an agent that no longer exists is replaced with a new one.
      const updated = await client.beta.agents.update(prev.agent_id, { ...b, version: prev.agent_version } as any).catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
      if (updated) return updated;
    }
    return client.beta.agents.create(b);
  };
  const agent: any = await save(body).catch((e) => (isPolicyError(e) ? save(plain) : Promise.reject(e)));

  const build: PlatformBuild = {
    platform: "claude",
    design_version: ctx.designVersion,
    model: design.model.selected,
    agent_id: agent.id,
    agent_version: agent.version,
    environment_id: environment.id,
    vault_id: vaultId,
    skill_id: skillId,
    url: `${CONSOLE}/agents/${agent.id}`,
    built_at: new Date().toISOString(),
    missing_keys: missing,
  };
  await saveHostedBuild(projectId, build);
  return build;
}

const isPolicyError = (e: any) => e?.status === 400 && /permission_policy|auto/i.test(String(e?.message ?? ""));

/** Run one task in a fresh session; denies anything that pauses for approval (nobody is there to say yes). */
/** What one hosted run did: its answer, the tools it called, and what it cost. */
export interface HostedRun {
  output: string;
  session: string;
  session_url?: string;
  usage: { input_tokens: number; output_tokens: number; cache_read?: number };
  /** Tool names in call order (tools.py tools and MCP tools). */
  calls: string[];
  tool_errors: number;
  latency_s: number;
  steps: number;
  /** The run stopped for a person (an approval, or a hand-off). */
  handed_off: boolean;
}

/** The tools.py tool a shell command ran, if any. */
export const toolFromCommand = (cmd: string) => /tools\.py\s+([a-z_][a-z0-9_]*)/i.exec(cmd ?? "")?.[1] ?? null;

/**
 * One conversation with the Claude agent: each turn sent in order, waiting for the agent to finish before the
 * next. With `fixtures`, the case's test data goes in the sandbox (tools answer from it; writes don't run).
 * Anything that pauses for approval is denied (nobody is there to say yes), except in an evaluation with test
 * data (`testMode`), where nothing real can happen.
 */
export async function runOnClaude(b: PlatformBuild, turns: string[], fixtures?: Record<string, unknown>, title?: string, testMode = false): Promise<HostedRun> {
  const client = await claudeClient();
  const resources: any[] = [];
  if (fixtures && Object.keys(fixtures).length) {
    const f: any = await client.beta.files.upload({ file: await toFile(Buffer.from(JSON.stringify(fixtures)), "eval_fixtures.json") } as any);
    resources.push({ type: "file", file_id: f.id, mount_path: FIXTURES_PATH });
  }
  const started = Date.now();
  const session: any = await client.beta.sessions.create({
    agent: { type: "agent", id: b.agent_id, version: b.agent_version },
    environment_id: b.environment_id,
    ...(b.vault_id ? { vault_ids: [b.vault_id] } : {}),
    ...(resources.length ? { resources } : {}),
    title: title ?? `Test: ${turns[0]?.slice(0, 60) ?? ""}`,
    // Our own test runs: left out of Operations' numbers.
    metadata: { source: "pipeline-test" },
  } as any);
  const run: HostedRun = { output: "", session: session.id, session_url: `${CONSOLE}/sessions/${session.id}`, usage: { input_tokens: 0, output_tokens: 0 }, calls: [], tool_errors: 0, latency_s: 0, steps: 0, handed_off: false };
  const stream: any = await client.beta.sessions.events.stream(session.id);
  // A hard limit even when the stream goes quiet: stop listening after 6 minutes.
  const timer = setTimeout(() => stream.controller?.abort(), 6 * 60_000);
  const it = stream[Symbol.asyncIterator]();
  try {
    for (const text of turns) {
      await client.beta.sessions.events.send(session.id, { events: [{ type: "user.message", content: [{ type: "text", text }] }] } as any);
      run.output = "";
      for (;;) {
        const next = await it.next();
        if (next.done) break;
        const ev = next.value;
        if (ev.type === "agent.message") {
          for (const c of ev.content ?? []) if (c.type === "text") run.output += c.text;
        } else if (ev.type === "agent.tool_use" || ev.type === "agent.mcp_tool_use") {
          run.steps++;
          const name = ev.type === "agent.mcp_tool_use" ? ev.name : toolFromCommand(ev.input?.command ?? "");
          if (name) run.calls.push(name);
          if (name === "handoff_to_user" || /hand_?off/i.test(name ?? "")) run.handed_off = true;
          if (ev.evaluated_permission === "ask") {
            // In a test with test data nothing real can happen: say yes, as our way's test runner does. Otherwise no.
            const allow = testMode && !!fixtures;
            if (!allow) run.handed_off = true;
            await client.beta.sessions.events.send(session.id, { events: [{ type: "user.tool_confirmation", tool_use_id: ev.id, result: allow ? "allow" : "deny" }] } as any);
          }
        } else if (ev.type === "agent.tool_result" || ev.type === "agent.mcp_tool_result") {
          if (ev.is_error || /^ERROR /m.test(JSON.stringify(ev.content ?? ""))) run.tool_errors++;
        } else if (ev.type === "session.status_idle" && ev.stop_reason?.type !== "requires_action") {
          break;
        } else if (ev.type === "session.status_terminated") {
          break;
        }
      }
    }
  } catch (e) {
    if (!stream.controller?.signal?.aborted) throw e;
  } finally {
    clearTimeout(timer);
    stream.controller?.abort();
  }
  run.latency_s = Math.round((Date.now() - started) / 100) / 10;
  const done: any = await client.beta.sessions.retrieve(session.id).catch(() => null);
  const u = done?.usage ?? {};
  run.usage = { input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output_tokens: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0 };
  return run;
}

/** Run the example tasks against the Claude agent and grade them. */
export async function testOnClaude(projectId: string, limit = 3): Promise<PlatformBuild> {
  const b = (await hostedBuilds(projectId)).claude;
  if (!b) throw new Error("Build it on Claude first.");
  const ctx = await loadBuild(projectId);
  const tasks = exampleTasks(ctx.spec ?? {}).slice(0, limit);
  const cases = await Promise.all(
    tasks.map(async (t) => {
      try {
        const r = await runOnClaude(b, [t.input]);
        await recordSpend(projectId, "Claude-hosted test", usageCostUsd(b.model, r.usage));
        const g = await gradeAnswer(t.input, t.expected, r.output);
        return { input: t.input, output: r.output.slice(0, 2000), ok: g.ok, reason: g.reason, session_url: r.session_url };
      } catch (e: any) {
        return { input: t.input, output: "", ok: false, reason: e?.message || "The run failed." };
      }
    }),
  );
  const next: PlatformBuild = { ...b, test: { at: new Date().toISOString(), ok: cases.length > 0 && cases.every((c) => c.ok), cases } };
  await saveHostedBuild(projectId, next);
  return next;
}
