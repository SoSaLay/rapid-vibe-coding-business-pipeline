import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { activeProvider } from "@/lib/llm/registry";

/**
 * Turn a failed deployment step's raw output into one plain line that says who needs to act.
 * Body: { error, log } → { who: "you" | "agent" | "pipeline", line }.
 */
async function handlePost(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const error = String(b.error ?? "").slice(0, 500);
  const log = String(b.log ?? "").slice(-6000);
  if (!error && !log) return NextResponse.json({ error: "Nothing to explain." }, { status: 400 });
  try {
    const r = await activeProvider().completeJson<{ who: "you" | "agent" | "pipeline"; line: string }>({
      system:
        "You explain a failed step of deploying an AI agent to its non-technical owner, in ONE plain sentence of at most 22 words. " +
        "Decide who must act: 'you' = the owner's setup (expired sign-in, wrong/missing key, account or plan limit, quota); " +
        "'agent' = the agent's own code failed on its task (fixable with Fix it); 'pipeline' = the builder app set something up wrong " +
        "(bad config it generated, a bug, a connection/pool setting) — not the owner's fault. For 'you', say exactly what to do.",
      effort: "low",
      tier: "small",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { who: { type: "string", enum: ["you", "agent", "pipeline"] }, line: { type: "string" } },
        required: ["who", "line"],
      },
      messages: [{ role: "user", content: `ERROR: ${error}\n\nRAW OUTPUT (end):\n${log}` }],
    });
    return NextResponse.json({ who: r.who, line: r.line.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't explain it." }, { status: 500 });
  }
}

export const POST = attributed(handlePost);
