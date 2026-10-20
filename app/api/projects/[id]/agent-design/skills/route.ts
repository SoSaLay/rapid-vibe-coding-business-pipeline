import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState, savePhaseState } from "@/lib/store";
import type { AgentDesign, SkillDef } from "@/lib/agent/design";
import { importSkill, plainSkillSummaries, skillSlug, writeSkill } from "@/lib/agent/skills";

/**
 * Body: { action, ... }
 *   write { request }          — the model writes a SKILL.md from a short description
 *   import { url }             — fetch a SKILL.md (GitHub link), security-review it; owner must sign off
 *   plain {}                   — fill the owner-facing one-liners that are missing (display only; keeps approval)
 *   set-all { enabled }        — turn every skill on or off (the Knowledge section's skills switch)
 *   edit { name, description, instructions } · toggle { name } · remove { name } · approve-review { name }
 * Any change reopens the design for approval (skills are part of what Engineering builds).
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
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

  if (b.action === "plain") {
    try {
      const next = { ...state, design: { ...design, skills: await plainSkillSummaries(skills) } };
      await savePhaseState(params.id, "agent-design", next);
      return NextResponse.json(next);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Couldn't summarize the skills." }, { status: 400 });
    }
  }

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
        plain: undefined,
        // Editing an imported skill makes it yours, but it still needs a fresh look.
        review: skills[i].review ? { ...skills[i].review!, approved: false } : undefined,
      };
    } else if (b.action === "toggle") {
      const i = at(b.name);
      if (i >= 0) skills[i] = { ...skills[i], enabled: !skills[i].enabled };
    } else if (b.action === "set-all") {
      for (let i = 0; i < skills.length; i++) skills[i] = { ...skills[i], enabled: !!b.enabled };
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

  const k = design.knowledge;
  const knowledge = k && k.mode !== "rag" ? { ...k, mode: skills.some((s) => s.enabled) ? ("skills" as const) : ("none" as const) } : k;
  const next = { ...state, design: { ...design, knowledge, skills: skills.map((s) => ({ ...s, name: skillSlug(s.name) })) }, approved: false };
  await savePhaseState(params.id, "agent-design", next);
  return NextResponse.json(next);
}

export const POST = attributed(handlePost);
