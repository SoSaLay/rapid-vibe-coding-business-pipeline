/**
 * Build + write the Pre-Marketing landing page to disk.
 *
 * Shared by the render route (manual generate/regenerate) and the deploy route
 * (re-render after deploy so the live URL gets baked into canonical/og:url).
 * Reads everything it needs from the project's pre-marketing phase-state.
 */

import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, getProject } from "@/lib/store";
import { getSupabaseConfig } from "@/lib/supabase";
import { renderLandingPage } from "@/lib/phases/landing-page";
import { readAssetBase64 } from "@/lib/brand-assets";

export function landingDir(projectId: string): string {
  return path.join(process.cwd(), "data", "projects", projectId, "landing");
}

export function landingFile(projectId: string): string {
  return path.join(landingDir(projectId), "index.html");
}

async function dataUri(projectId: string, ref?: { file: string }): Promise<string | undefined> {
  if (!ref?.file) return undefined;
  const data = await readAssetBase64(projectId, ref.file);
  return data ? `data:${data.mime};base64,${data.base64}` : undefined;
}

export interface BuildLandingOptions {
  /** Override the stored threeHero preference (else falls back to phase-state). */
  threeHero?: boolean;
}

/**
 * Render the landing page from current state and write it to disk. Returns the
 * file path. Throws with a user-facing message if prerequisites are missing.
 */
export async function buildAndWriteLanding(projectId: string, opts: BuildLandingOptions = {}): Promise<string> {
  const state = await getPhaseState<any>(projectId, "pre-marketing");
  if (!state?.kit) throw new Error("Generate the validation kit first.");
  const cfg = await getSupabaseConfig();
  if (!cfg) throw new Error("Connect Supabase first.");
  const project = await getProject(projectId);

  const a = state.assets || {};
  const [logo, hero, og] = await Promise.all([
    dataUri(projectId, a.logo),
    dataUri(projectId, a.hero),
    dataUri(projectId, a.og),
  ]);

  const html = renderLandingPage(state.kit, {
    url: cfg.url,
    anonKey: cfg.anonKey,
    projectId,
    brand: project?.title || "Our product",
    assets: { logo, hero, og },
    threeHero: opts.threeHero ?? !!state.landingThreeHero,
    // Bake in the live URL once deployed; before that the page self-sets it at runtime.
    canonicalUrl: state.landingDeployedUrl || undefined,
  });

  const file = landingFile(projectId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  return file;
}
