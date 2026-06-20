import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { buildAndWriteLanding, landingFile } from "@/lib/phases/landing-build";

/** Generate (or regenerate) the landing page HTML from the kit + Supabase config. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const threeHero = !!body.threeHero;
  try {
    // Persist the threeHero choice so re-renders (e.g. after deploy) keep it.
    const state = (await getPhaseState<any>(params.id, "pre-marketing")) || {};
    await savePhaseState(params.id, "pre-marketing", { ...state, landingThreeHero: threeHero });
    await buildAndWriteLanding(params.id, { threeHero });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate landing page." }, { status: 400 });
  }
}

/** Serve the generated landing page for preview (or download with ?download=1). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const html = await fs.readFile(landingFile(params.id), "utf8");
    const download = req.nextUrl.searchParams.get("download");
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (download) headers["Content-Disposition"] = `attachment; filename="landing.html"`;
    return new NextResponse(html, { headers });
  } catch {
    return NextResponse.json({ error: "No landing page generated yet." }, { status: 404 });
  }
}
