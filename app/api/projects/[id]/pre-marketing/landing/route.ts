import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, getProject } from "@/lib/store";
import { getSupabaseConfig } from "@/lib/supabase";
import { renderLandingPage } from "@/lib/phases/landing-page";

function landingPath(projectId: string) {
  return path.join(process.cwd(), "data", "projects", projectId, "landing", "index.html");
}

/** Generate (or regenerate) the landing page HTML from the kit + Supabase config. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "Generate the validation kit first." }, { status: 400 });
  const cfg = await getSupabaseConfig();
  if (!cfg) return NextResponse.json({ error: "Connect Supabase first." }, { status: 400 });
  const project = await getProject(params.id);

  const html = renderLandingPage(state.kit, {
    url: cfg.url,
    anonKey: cfg.anonKey,
    projectId: params.id,
    brand: project?.title || "Our product",
  });
  const file = landingPath(params.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  return NextResponse.json({ ok: true });
}

/** Serve the generated landing page for preview (or download with ?download=1). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const html = await fs.readFile(landingPath(params.id), "utf8");
    const download = req.nextUrl.searchParams.get("download");
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (download) headers["Content-Disposition"] = `attachment; filename="landing.html"`;
    return new NextResponse(html, { headers });
  } catch {
    return NextResponse.json({ error: "No landing page generated yet." }, { status: 404 });
  }
}
