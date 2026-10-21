/**
 * Keep the agent's copies on Claude and ChatGPT in step with every change made in the pipeline.
 *
 * The approved design + the agent's code (instructions and tools) + its keys are the source of truth. Anything
 * that changes them (approving a design, Fix it, the Agent Changer, a self-hosted rebuild, saving keys) calls
 * scheduleHostedSync(); a moment later each hosted copy is updated in place: on Claude as a new agent version
 * (and a new version of its tools skill), on ChatGPT as an updated agent. A copy is only re-uploaded when
 * something it's built from actually changed.
 */

import { createHash } from "crypto";
import { beginActivity } from "../activity";
import { isAutoflowRunning } from "../autoflow";
import { loadBuild } from "../build-context";
import { runsModel, type PlatformBuild } from "../platforms";
import { hostedBuilds, hostedKeys, hostedLogic, saveHostedBuild } from "./common";

type Hosted = "claude" | "chatgpt";

/** What a hosted copy is built from: when this changes, the copy needs updating. */
export async function hostedFingerprint(projectId: string): Promise<string> {
  const ctx = await loadBuild(projectId);
  if (!ctx.design) return "";
  const logic = await hostedLogic(projectId);
  const { keys } = await hostedKeys(projectId, ctx.design);
  return createHash("sha256")
    .update(JSON.stringify({ design: ctx.design, logic, keys: Object.entries(keys).sort() }))
    .digest("hex")
    .slice(0, 16);
}

async function rebuild(projectId: string, platform: Hosted): Promise<PlatformBuild> {
  // Loaded lazily: the platform modules pull in their SDKs.
  if (platform === "claude") return (await import("./claude")).buildOnClaude(projectId);
  return (await import("./chatgpt")).buildOnChatGPT(projectId);
}

/**
 * Update every hosted copy that's behind (or just `only`). Returns what happened per platform.
 * `force` re-uploads even when nothing changed.
 */
export async function syncHosted(projectId: string, opts: { only?: Hosted; force?: boolean } = {}): Promise<Partial<Record<Hosted, string>>> {
  const builds = await hostedBuilds(projectId);
  const targets = (Object.keys(builds) as Hosted[]).filter((p) => !opts.only || p === opts.only);
  if (!targets.length) return {};
  const ctx = await loadBuild(projectId);
  if (!ctx.design) return {};
  const out: Partial<Record<Hosted, string>> = {};
  const fp = await hostedFingerprint(projectId);
  for (const p of targets) {
    const b = builds[p]!;
    if (!runsModel(p, ctx.design.model.selected)) {
      await saveHostedBuild(projectId, { ...b, error: `Agent Design now uses a model ${p === "claude" ? "Claude" : "ChatGPT"} can't run: pick one on the ${p === "claude" ? "Claude" : "ChatGPT"} tab to update it.` });
      out[p] = "model doesn't fit";
      continue;
    }
    if (!opts.force && b.synced_fp === fp && b.design_version === ctx.designVersion) {
      out[p] = "up to date";
      continue;
    }
    const end = beginActivity(projectId, "engineering", `Updating the ${p === "claude" ? "Claude" : "ChatGPT"} agent with your latest changes`);
    try {
      const next = await rebuild(projectId, p);
      // Keep its last test results (they're re-run on request), and remember what this copy is built from.
      await saveHostedBuild(projectId, { ...next, test: b.test, synced_fp: fp, error: undefined });
      out[p] = "updated";
      // A chat page that's online points at the agent's sandbox and keys: update it when those changed.
      if (next.environment_id !== b.environment_id || next.vault_id !== b.vault_id) {
        const { getChat, deployChat } = await import("../chat/app");
        const chat = await getChat(projectId);
        if (chat?.url && chat.platform === p) await deployChat(projectId, p).catch(() => {});
      }
    } catch (e: any) {
      await saveHostedBuild(projectId, { ...b, error: `Couldn't update it: ${e?.message ?? "error"}` });
      out[p] = "failed";
    } finally {
      end();
    }
  }
  return out;
}

// One pending sync per agent: several changes in a row cause one update.
const g = globalThis as unknown as { __hostedSync?: Map<string, NodeJS.Timeout> };
g.__hostedSync ??= new Map();
const timers = g.__hostedSync;

/**
 * Update the hosted copies soon (a few seconds after the last change). While the self-hosted agent is being
 * rebuilt, it waits for that to finish so the new code is written once, then shared.
 */
export function scheduleHostedSync(projectId: string, delayMs = 4000) {
  const prev = timers.get(projectId);
  if (prev) clearTimeout(prev);
  timers.set(
    projectId,
    setTimeout(async () => {
      timers.delete(projectId);
      if (!Object.keys(await hostedBuilds(projectId).catch(() => ({}))).length) return;
      // The self-hosted agent is being rebuilt (its new code isn't written yet): wait, then share it.
      if (isAutoflowRunning(projectId)) return scheduleHostedSync(projectId, 15_000);
      await syncHosted(projectId).catch(() => {});
    }, delayMs),
  );
}
