import { NextRequest, NextResponse } from "next/server";
import { chosenHost, getDeploy, hostCredentials, releaseFailures } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { loadBuild } from "@/lib/agent/build-context";
import { promises as fs } from "fs";
import { neonKey, supabaseToken } from "@/lib/agent/db-provision";
import { getProjectSettings } from "@/lib/store";
import path from "path";
import { sh } from "@/lib/agent/proc";

/**
 * What changed between two commits, for the Release history table. A commit range never changes, so each
 * answer is kept for the life of the server (this page is opened often; each git call costs ~40ms).
 */
const g = globalThis as unknown as { __releaseNotes?: Map<string, string | null> };
g.__releaseNotes ??= new Map();
const noteCache = g.__releaseNotes;

async function releaseNote(dir: string, prev: string, commit: string): Promise<string | null> {
  const key = `${dir}\0${prev}..${commit}`;
  if (noteCache.has(key)) return noteCache.get(key)!;
  const r = await sh("git", ["log", "--format=%s", `${prev}..${commit}`], { cwd: dir, timeoutMs: 10_000 }).catch(() => null);
  // A commit no longer exists (e.g. history was cleaned): leave the note blank.
  if (!r?.ok) return null;
  const subjects = r.out.trim().split("\n").filter((x) => x && !/^release /.test(x));
  const agent = subjects.filter((x) => /^agent:/.test(x)).map((x) => x.replace(/^agent:\s*/, "").replace(/^(safety|quality) fix:\s*/, "Fix: "));
  const note = agent.length
    ? Array.from(new Set(agent)).slice(0, 3).join(" · ")
    : subjects.some((x) => /^evals:/.test(x))
      ? "Test cases updated"
      : subjects.length
        ? "Deployment setup updated (no agent changes)"
        : "Same code as the previous release";
  noteCache.set(key, note);
  return note;
}

/** Deployment status for the page. Never returns secret values. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const [ctx, host, env, state, settings, neon, supabase] = await Promise.all([
    loadBuild(params.id),
    chosenHost(params.id),
    credentialsAdapter(params.id).then((a) => a.envFor(params.id)),
    getDeploy(params.id),
    getProjectSettings(params.id),
    neonKey(),
    supabaseToken(),
  ]);
  const [prepared, hostCreds] = await Promise.all([
    fs.access(path.join(ctx.dir, "server.py")).then(() => true).catch(() => false),
    hostCredentials(host),
  ]);
  // What changed in each recent release, compared with the release before it, for the Release history table.
  const notes: Record<string, string> = {};
  const commits = state.history.map((h) => h.commit);
  const isSha = (c: string) => /^[0-9a-f]{6,40}$/.test(c);
  await Promise.all(
    state.history.map(async (h, i) => {
      if (i < state.history.length - 10 || !isSha(h.commit)) return;
      const prev = [...commits.slice(0, i)].reverse().find((c) => c !== h.commit && isSha(c));
      if (!prev) {
        notes[h.id] = "First release";
        return;
      }
      const note = await releaseNote(ctx.dir, prev, h.commit);
      if (note) notes[h.id] = note;
    }),
  );
  const candidate = state.staging?.release.id;
  return NextResponse.json({
    notes,
    state,
    // What stands between the testing agent and going live (empty = passed), for "Go live anyway".
    failures: candidate ? releaseFailures(state, candidate) : [],
    host,
    login: ctx.design?.login?.selected ?? "machine-key",
    db: settings.agentStack?.["state-db"] === "neon" ? "neon" : "supabase",
    hostConnected: !!hostCreds,
    hasDatabaseUrl: !!env.DATABASE_URL,
    neonConnected: !!neon,
    supabaseConnected: !!supabase,
    hasJwks: !!env.AUTH_JWKS_URL,
    prepared,
    workspace: ctx.dir,
  });
}
