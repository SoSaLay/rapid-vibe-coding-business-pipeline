import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { activeDesignEngine } from "@/lib/design/engine";

function mockupDir(projectId: string) {
  return path.join(process.cwd(), "data", "projects", projectId, "mockups");
}

// Screen ids come from the LLM brief — keep file paths strictly inside mockupDir.
function safeName(screenId: string) {
  return screenId.replace(/[^a-z0-9-]/gi, "").toLowerCase();
}

/** Generate mockup(s). Body: { screenId } for one screen, or omit for all key screens. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "product-design");
  if (!state?.brief) return NextResponse.json({ error: "Generate the design brief first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const screens: any[] = state.brief?.ux?.screens || [];
  const targets = body.screenId
    ? screens.filter((s) => s.id === body.screenId)
    : screens.filter((s) => s.is_key_screen).slice(0, 4);
  if (targets.length === 0) return NextResponse.json({ error: "No matching screen in the brief." }, { status: 400 });

  try {
    const engine = await activeDesignEngine(params.id);
    const dir = mockupDir(params.id);
    await fs.mkdir(dir, { recursive: true });
    const mockups: Record<string, string> = { ...(state.mockups || {}) };
    const mockupEngines: Record<string, string> = { ...(state.mockupEngines || {}) };
    for (const screen of targets) {
      const html = await engine.generateScreen(state.brief, screen);
      await fs.writeFile(path.join(dir, `${safeName(screen.id)}.html`), html, "utf8");
      mockups[screen.id] = new Date().toISOString();
      mockupEngines[screen.id] = engine.id;
    }
    await savePhaseState(params.id, "product-design", { ...state, mockups, mockupEngines });
    return NextResponse.json({ mockups, mockupEngines, engine: engine.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate mockup." }, { status: 500 });
  }
}
