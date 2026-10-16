import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import type { AgentDesign, SkillDef } from "@/lib/agent/design";
import { importSkill, skillSlug, writeSkill } from "@/lib/agent/skills";

/**
 * Body: { action, ... }
 *   write { request }          — the model writes a SKILL.md from a short description
 *   import { url }             — fetch a SKILL.md (GitHub link), security-review it; owner must sign off
 *   edit { name, description, instructions } · toggle { name } · remove { name } · approve-review { name }
 * Any change reopens the design for approval (skills are part of what Engineering builds).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const state = await getPhaseState<{ design: AgentDesign; approved?: boolean }>(params.id, "agent-design");
  if (!state?.design) return NextResponse.json({ error: "Generate the design first." }, { status: 400 });
  const design = state.design;
  const skills: SkillDef[] = [...(design.skills ?? [])];
  const at = (name: string) => skills.findIndex((s) => s.name === name);
  const unique = (s: SkillDef) => {
    let n = s.name;
    for (let i = 2; skills.some((x) => x.name === n); i++) n = `${s.name}-${i}`;
    return { ...s, name: n };
  };

  try {
    if (b.action === "write") {
      if (!String(b.request ?? "").trim()) return NextResponse.json({ error: "Describe the skill first." }, { status: 400 });
      const s = await writeSkill({ request: String(b.request).slice(0, 4000), agentSummary: design.summary, tools: design.tools.filter((t) => t.enabled).map((t) => t.name) });
      skills.push(unique(s));
    } else if (b.action === "import") {
      skills.push(unique(await importSkill(String(b.url ?? ""))));
    } else if (b.action === "edit") {
      const i = at(b.name);
      if (i < 0) return NextResponse.json({ error: "No such skill." }, { status: 404 });
      skills[i] = {
        ...skills[i],
        description: String(b.description ?? skills[i].description).slice(0, 600),
        instructions: String(b.instructions ?? skills[i].instructions).slice(0, 40_000),
        // Editing an imported skill makes it yours, but it still needs a fresh look.
        review: skills[i].review ? { ...skills[i].review!, approved: false } : undefined,
      };
    } else if (b.action === "toggle") {
      const i = at(b.name);
      if (i >= 0) skills[i] = { ...skills[i], enabled: !skills[i].enabled };
    } else if (b.action === "remove") {
      const i = at(b.name);
      if (i >= 0) skills.splice(i, 1);
    } else if (b.action === "approve-review") {
      const i = at(b.name);
      if (i >= 0 && skills[i].review) skills[i] = { ...skills[i], review: { ...skills[i].review!, approved: true } };
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "That didn't work." }, { status: 400 });
  }

  const next = { ...state, design: { ...design, skills: skills.map((s) => ({ ...s, name: skillSlug(s.name) })) }, approved: false };
  await savePhaseState(params.id, "agent-design", next);
  return NextResponse.json(next);
}
