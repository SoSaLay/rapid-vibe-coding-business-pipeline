/**
 * The Automatic Agent Changer: the side-panel chat on Agent Design.
 *  - "design" mode edits the draft design (it reopens for approval, like an Edit link).
 *  - "code" mode works on the BUILT agent: the change becomes the approved design and the
 *    codebase is re-rendered and committed, so the agent is re-tested and re-reviewed.
 *    New or removed tools need a full rebuild, which Engineering then offers.
 */

import { getPhaseState, latestArtifact, savePhaseState } from "../store";
import { loadBuild, needsRewrite } from "./build-context";
import { applyToBuild, approveDesign } from "./apply-change";
import { chatEditDesign, type ChatTurn } from "../phases/agent-design-chat";
import type { AgentDesign } from "./design";

export type BuilderMode = "design" | "code";

export async function getBuilderChat(projectId: string): Promise<ChatTurn[]> {
  return (await getPhaseState<{ chat?: ChatTurn[] }>(projectId, "agent-design"))?.chat ?? [];
}

export async function runBuilder(projectId: string, message: string, mode: BuilderMode): Promise<{ chat: ChatTurn[]; reply: string; changed: boolean }> {
  const state = await getPhaseState<{ design?: AgentDesign; approved?: boolean; chat?: ChatTurn[] }>(projectId, "agent-design");
  if (!state?.design) throw new Error("Generate the design first.");
  const history = state.chat ?? [];
  const ctx = mode === "code" ? await loadBuild(projectId) : null;
  const built = !!ctx?.build?.logic && !!ctx.design;
  const spec = ctx?.spec ?? ((await latestArtifact(projectId, "product-spec"))?.payload as Record<string, any> | undefined) ?? null;

  // On a built agent the AI works from what was actually built; otherwise from the draft.
  const base = built ? ctx!.design! : state.design;
  const r = await chatEditDesign({ design: base, spec, history, message, logic: built ? ctx!.build!.logic : null });
  const designChanged = JSON.stringify(r.design) !== JSON.stringify(base);
  const logicChanged = built && JSON.stringify(r.logic) !== JSON.stringify(ctx!.build!.logic);
  let reply = r.reply;

  if (!built) {
    if (designChanged) await savePhaseState(projectId, "agent-design", { ...state, design: r.design, approved: false });
  } else if (designChanged || logicChanged) {
    if (await needsRewrite(projectId, ctx!.build!, r.design)) {
      await approveDesign(projectId, r.design);
      reply += " This changes the tools or where the data comes from, so the code needs a full rewrite: press Rebuild everything in Development.";
    } else {
      await applyToBuild({
        projectId,
        ctx: ctx!,
        design: r.design,
        logic: r.logic!,
        message: `agent: builder: ${message.slice(0, 72)}`,
        reinstall: r.codeChanged,
        keepTests: false,
      });
      reply += " Your agent's code is updated; Development re-tests and re-reviews it.";
    }
  }

  const chat = [...history, { role: "user" as const, text: message }, { role: "assistant" as const, text: reply }].slice(-40);
  const latest = (await getPhaseState<any>(projectId, "agent-design")) ?? {};
  await savePhaseState(projectId, "agent-design", { ...latest, chat });
  return { chat, reply, changed: designChanged || logicChanged };
}
