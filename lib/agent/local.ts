/**
 * Run the agent on the owner's computer, with its own page (templates/agent-local): a chat page, a run
 * page, or both, per the basics. This is where every agent is tested and used first; "Just me" agents
 * stop here, and agents going online release a staging copy on their host afterwards.
 *
 * The agent runs as its own process from its own folder (uv run python local_app.py), on 127.0.0.1 only,
 * on its own port: it's never shown inside the pipeline app. The pipeline just starts, stops and links to it.
 */

import { spawn } from "child_process";
import { promises as fs, openSync, closeSync } from "fs";
import net from "net";
import path from "path";
import crypto from "crypto";
import { loadBuild } from "./build-context";
import { agentEnv } from "./env";
import { deployFiles } from "./adapters/deploy-files";
import { writeCodebase } from "../phases/agent-engineering";
import { getDeploy, saveDeploy, chosenHost } from "./deploy";
import { uvBin } from "./proc";
import { parseBasics, type AgentMode } from "./basics";
import { AGENT_MODELS, type AgentDesign } from "./design";

const TEMPLATE = path.join(process.cwd(), "templates", "agent-local");
const FIRST_PORT = 8765;

export interface LocalRun {
  pid: number;
  port: number;
  url: string;
  started_at: string;
}

export interface LocalStatus {
  running: boolean;
  url?: string;
  port?: number;
  started_at?: string;
  mode: AgentMode;
  /** The last lines the agent printed (shown when it fails to start). */
  log?: string;
}

/** Chat page, run page, or both: the owner's answer, else what Define the Job inferred. */
export function pageMode(design: AgentDesign | null, spec: Record<string, any> | null): AgentMode {
  const b = parseBasics(design?.basics ?? spec?.agent?.basics);
  if (b) return b.mode;
  return spec?.agent?.people_use_it === false ? "background" : "chat";
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ping(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

/** The agent keeps the same port between starts when it can (so a bookmarked page keeps working). */
async function pickPort(preferred?: number): Promise<number> {
  if (preferred && (await portFree(preferred))) return preferred;
  for (let p = FIRST_PORT; p < FIRST_PORT + 200; p++) if (await portFree(p)) return p;
  throw new Error("No free port on this computer for the agent.");
}

const logPath = (dir: string) => path.join(dir, "local", "agent.log");

async function tail(file: string, lines = 30): Promise<string> {
  const s = await fs.readFile(file, "utf8").catch(() => "");
  return s.split("\n").slice(-lines).join("\n").trim();
}

export async function localStatus(projectId: string): Promise<LocalStatus> {
  const [ctx, s] = await Promise.all([loadBuild(projectId), getDeploy(projectId)]);
  const mode = pageMode(ctx.design, ctx.spec);
  const run = s.local;
  if (run && alive(run.pid) && (await ping(run.port))) return { running: true, url: run.url, port: run.port, started_at: run.started_at, mode };
  // The log only matters when it stopped on its own (a crash), not after Stop.
  return { running: false, mode, port: run?.port, log: run?.pid ? await tail(logPath(ctx.dir)) : undefined };
}

/**
 * Inputs the run page asks for. Never keys, tokens, passwords or approvals: keys come from Agent
 * Development's keys table, and approvals are the page's own Approve / Reject buttons.
 */
const NOT_AN_INPUT = /(^|_)(token|tokens|api_?key|key|secret|password|passwd|credential|credentials|auth|oauth|bearer|approval|approve|approved|confirm|confirmation|consent)(_|$)/i;
export function pageInputs(design: AgentDesign) {
  return (design.inputs ?? [])
    .filter((f) => !NOT_AN_INPUT.test(f.name))
    .map((f) => ({ name: f.name, description: f.description, required: f.required }));
}

/** Starter prompts for the chat page: the job's own example tasks, shortened (no AI, so free). */
export function starterPrompts(spec: Record<string, any> | null): string[] {
  const tasks: string[] = (spec?.agent?.example_tasks ?? []).map((e: any) => String(e?.input ?? "")).filter(Boolean);
  const short = tasks.map((t) => {
    const one = t.replace(/\s+/g, " ").trim();
    return one.length <= 90 ? one : one.slice(0, 87).replace(/\s+\S*$/, "") + "…";
  });
  return [...new Set(short)].slice(0, 5);
}

export interface ScheduleSuggestion {
  text: string;
  s: { every: "minutes" | "hours" | "day" | "weekdays" | "week"; minutes?: number; hours?: number; weekday?: string; time?: string };
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Schedule chips for the run page, read from the job's trigger (no AI, so free): a schedule becomes that
 * schedule, an event ("a new email arrives") becomes checking for it every so often, and a manual trigger
 * ("user clicks run") gets none.
 */
export function scheduleSuggestions(spec: Record<string, any> | null): ScheduleSuggestion[] {
  const t = String(spec?.agent?.trigger ?? "").toLowerCase();
  if (!t) return [];
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t);
  const time = m
    ? `${String((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2] ?? "00"}`
    : /noon|midday/.test(t) ? "12:00" : /evening|end of (the )?day/.test(t) ? "17:00" : /night/.test(t) ? "21:00" : "09:00";
  const out: ScheduleSuggestion[] = [];

  const days = DAYS.filter((d) => new RegExp(`\\b${d}s?\\b`).test(t));
  for (const d of days.slice(0, 2)) out.push({ text: `Every ${cap(d)} at ${clock(time)}`, s: { every: "week", weekday: d, time } });
  if (!days.length && /\bweekly\b|\bevery week\b|\bonce a week\b/.test(t)) out.push({ text: `Every Monday at ${clock(time)}`, s: { every: "week", weekday: "monday", time } });
  if (/\bweekdays?\b|\bbusiness days?\b|\bworkdays?\b/.test(t)) out.push({ text: `Every weekday at ${clock(time)}`, s: { every: "weekdays", time } });
  else if (/\bdaily\b|\bevery (day|morning|evening|night)\b|\beach day\b|\bnightly\b/.test(t))
    out.push({ text: `Every day at ${clock(time)}`, s: { every: "day", time } });
  const hours = /\bevery (\d+) hours?\b/.exec(t);
  if (hours) out.push({ text: `Every ${hours[1]} hours`, s: { every: "hours", hours: Number(hours[1]) } });
  else if (/\bhourly\b|\bevery hour\b/.test(t)) out.push({ text: "Every hour", s: { every: "hours", hours: 1 } });
  if (out.length) return out.slice(0, 3);

  // Something happens (a new email, a file appears): check for it every so often.
  const ev = /\bnew (\w+)|\b(\w+) (arrives|appears|comes in|is added|is uploaded|lands)\b/.exec(t);
  if (ev || /\bwhen(ever)?\b|\bsubmits?\b|\breceives?\b|\btriggers?\b|\bwebhook\b/.test(t)) {
    const noun = (ev?.[1] || ev?.[2] || "").replace(/[^a-z]/g, "");
    const plural = !noun ? "work" : /s$/.test(noun) ? noun : `${noun}s`;
    return [
      { text: `Check for new ${plural} every 15 minutes`, s: { every: "minutes", minutes: 15 } },
      { text: `Check for new ${plural} every hour`, s: { every: "hours", hours: 1 } },
    ];
  }
  return []; // run by hand ("user clicks run"): no schedule to suggest
}

/** Write the agent's local server and page into its folder (from the current design). */
async function writeLocalFiles(ctx: Awaited<ReturnType<typeof loadBuild>>, mode: AgentMode, host: "agentcore" | "railway", designUrl: string) {
  const design = ctx.design!;
  const [app, page] = await Promise.all([
    fs.readFile(path.join(TEMPLATE, "local_app.py"), "utf8"),
    fs.readFile(path.join(TEMPLATE, "index.html"), "utf8"),
  ]);
  const config = {
    title: ctx.title,
    mode,
    summary: design.summary,
    inputs: pageInputs(design),
    starters: starterPrompts(ctx.spec),
    schedules: scheduleSuggestions(ctx.spec),
    design_url: designUrl,
    // What the Agent Helper's Configure tab shows.
    overview: {
      model: AGENT_MODELS.find((m) => m.id === design.model.selected)?.label ?? design.model.selected,
      approach: design.approach.selected === "workflow" ? "Fixed steps" : "Decides its own steps",
      tools: design.tools
        .filter((t) => t.enabled)
        .map((t) => ({ name: t.name, description: t.description, approval: t.requires_approval, writes: t.side_effect === "write" })),
    },
  };
  const gitignore = await fs.readFile(path.join(ctx.dir, ".gitignore"), "utf8").catch(() => "");
  const ignore = ["local/agent.log", "local/pending.json", "local/schedule.json"].filter((l) => !gitignore.split("\n").includes(l));
  await writeCodebase(
    ctx.dir,
    [
      // The local page runs the same handler as the deployed server (approvals, run log, safety).
      ...deployFiles({ title: ctx.title, design, host }),
      { path: "local_app.py", content: app, explains: "Runs the agent on your computer with its own page." },
      { path: "local/index.html", content: page, explains: "The agent's own page: chat, runs, or both." },
      { path: "local/page.json", content: JSON.stringify(config, null, 2) + "\n", explains: "What the agent's page shows." },
      ...(ignore.length ? [{ path: ".gitignore", content: gitignore.trimEnd() + "\n" + ignore.join("\n") + "\n", explains: "" }] : []),
    ],
    "local: run on this computer with its own page"
  );
}

/** `origin`: where the pipeline runs (from the request), so the page's Agent Helper can reach it. */
export async function startLocal(projectId: string, origin?: string): Promise<LocalStatus> {
  const current = await localStatus(projectId);
  if (current.running) return current;

  const ctx = await loadBuild(projectId);
  if (!ctx.design || !ctx.build) throw new Error("Build the agent in Agent Development first.");
  const mode = pageMode(ctx.design, ctx.spec);
  const s = await getDeploy(projectId);
  const pipelineUrl = origin || s.local?.pipeline_url || "http://127.0.0.1:3000";
  await writeLocalFiles(ctx, mode, await chosenHost(projectId), `${pipelineUrl}/project/${projectId}/agent-design`);

  const port = await pickPort(s.local?.port);
  const env = await agentEnv(projectId, ctx.design, ctx.slug);
  const token = s.local?.token || crypto.randomBytes(24).toString("base64url");
  const bridgeKey = s.local?.bridge_key || crypto.randomBytes(24).toString("base64url");
  // Only what the agent needs: never the pipeline's own settings (its port, keys, database).
  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    ...env,
    AGENT_NAME: ctx.slug,
    LOCAL_PORT: String(port),
    LOCAL_TOKEN: token,
    PIPELINE_URL: pipelineUrl,
    PIPELINE_PROJECT: projectId,
    PIPELINE_KEY: bridgeKey,
    PYTHONUNBUFFERED: "1",
  };
  childEnv.DATABASE_URL = ""; // local runs keep their state on this computer (an empty value also beats the agent's .env)

  const log = logPath(ctx.dir);
  await fs.mkdir(path.dirname(log), { recursive: true });
  const fd = openSync(log, "w");
  const child = spawn(uvBin(), ["run", "python", "local_app.py"], { cwd: ctx.dir, env: childEnv as NodeJS.ProcessEnv, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  child.unref();
  if (!child.pid) throw new Error("The agent didn't start.");

  const url = `http://127.0.0.1:${port}`;
  await saveDeploy(projectId, { ...(await getDeploy(projectId)), local: { pid: child.pid, port, url, started_at: new Date().toISOString(), token, bridge_key: bridgeKey, pipeline_url: pipelineUrl } });

  // The first start may install packages: give it a few minutes.
  const until = Date.now() + 4 * 60_000;
  while (Date.now() < until) {
    if (await ping(port)) return { running: true, url, port, started_at: new Date().toISOString(), mode };
    if (!alive(child.pid)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const out = await tail(log);
  await stopLocal(projectId);
  throw Object.assign(new Error("Your agent didn't start on this computer."), { log: out });
}

export async function stopLocal(projectId: string): Promise<void> {
  const s = await getDeploy(projectId);
  const run = s.local;
  if (run && alive(run.pid)) {
    // Detached: it leads its own process group (uv and the Python under it).
    try {
      process.kill(-run.pid, "SIGTERM");
    } catch {
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  if (run) await saveDeploy(projectId, { ...s, local: { ...run, pid: 0 } });
}

/** True when the request carries this agent's bridge key (the agent's own page, via its local server). */
export async function bridgeAllowed(projectId: string, key: string | null): Promise<boolean> {
  const want = (await getDeploy(projectId)).local?.bridge_key;
  if (!want || !key || key.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want));
}

/** After a change is built: if the agent is running here, restart it on the new code. */
export async function restartLocalIfRunning(projectId: string): Promise<boolean> {
  if (!(await localStatus(projectId)).running) return false;
  await stopLocal(projectId);
  await new Promise((r) => setTimeout(r, 800));
  await startLocal(projectId);
  return true;
}
