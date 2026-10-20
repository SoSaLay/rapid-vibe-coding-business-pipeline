import { NextRequest, NextResponse } from "next/server";
import { chosenHost, getDeploy, hostCredentials, releaseFailures } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { loadBuild } from "@/lib/agent/build-context";
import { promises as fs } from "fs";
import { neonKey, supabaseToken } from "@/lib/agent/db-provision";
import { getProjectSettings } from "@/lib/store";
import path from "path";
import { sh } from "@/lib/agent/proc";

/** Deployment status for the page. Never returns secret values. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const host = await chosenHost(params.id);
  const env = await (await credentialsAdapter(params.id)).envFor(params.id);
  const prepared = await fs.access(path.join(ctx.dir, "server.py")).then(() => true).catch(() => false);
  // What changed in each recent release, compared with the release before it, for the Release history table.
  const state = await getDeploy(params.id);
  const notes: Record<string, string> = {};
  const commits = state.history.map((h) => h.commit);
  for (let i = Math.max(0, state.history.length - 10); i < state.history.length; i++) {
    const h = state.history[i];
    if (!/^[0-9a-f]{6,40}$/.test(h.commit)) continue;
    const prev = [...commits.slice(0, i)].reverse().find((c) => c !== h.commit && /^[0-9a-f]{6,40}$/.test(c));
    if (!prev) {
      notes[h.id] = "First release";
      continue;
    }
    if (prev === h.commit) continue;
    const r = await sh("git", ["log", "--format=%s", `${prev}..${h.commit}`], { cwd: ctx.dir, timeoutMs: 10_000 }).catch(() => null);
    if (!r?.ok) continue; // a commit no longer exists (e.g. history was cleaned): leave the note blank
    const subjects = (r?.ok ? r.out.trim().split("\n") : []).filter((x) => x && !/^release /.test(x));
    const agent = subjects.filter((x) => /^agent:/.test(x)).map((x) => x.replace(/^agent:\s*/, "").replace(/^(safety|quality) fix:\s*/, "Fix: "));
    notes[h.id] = agent.length
      ? Array.from(new Set(agent)).slice(0, 3).join(" · ")
      : subjects.some((x) => /^evals:/.test(x))
        ? "Test cases updated"
        : subjects.length
          ? "Deployment setup updated (no agent changes)"
          : "Same code as the previous release";
  }
  const candidate = state.staging?.release.id;
  return NextResponse.json({
    notes,
    state,
    // What stands between the testing agent and going live (empty = passed), for "Go live anyway".
    failures: candidate ? releaseFailures(state, candidate) : [],
    host,
    login: ctx.design?.login?.selected ?? "machine-key",
    db: (await getProjectSettings(params.id)).agentStack?.["state-db"] === "neon" ? "neon" : "supabase",
    hostConnected: !!(await hostCredentials(host)),
    hasDatabaseUrl: !!env.DATABASE_URL,
    neonConnected: !!(await neonKey()),
    supabaseConnected: !!(await supabaseToken()),
    hasJwks: !!env.AUTH_JWKS_URL,
    prepared,
    workspace: ctx.dir,
  });
}
