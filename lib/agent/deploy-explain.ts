/** Turn a failed deployment step's raw output into one plain line that says who needs to act. */

import { activeProvider } from "../llm/registry";

export type Who = "you" | "agent" | "pipeline";

export async function explainFailure(error: string, log: string): Promise<{ who: Who; line: string }> {
  const r = await activeProvider().completeJson<{ who: Who; line: string }>({
    system:
      "You explain a failed step of deploying an AI agent to its non-technical owner, in ONE plain sentence of at most 22 words. " +
      "Decide who must act: 'you' = the owner's setup (expired sign-in, wrong/missing key, account or plan limit, quota, out of credits); " +
      "'agent' = the agent's own code failed on its task (fixable by changing the agent); 'pipeline' = the builder app set something up wrong " +
      "(bad config it generated, a bug, a connection/pool setting) — not the owner's fault. For 'you', say exactly what to do.",
    effort: "low",
    tier: "small",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { who: { type: "string", enum: ["you", "agent", "pipeline"] }, line: { type: "string" } },
      required: ["who", "line"],
    },
    messages: [{ role: "user", content: `ERROR: ${error.slice(0, 500)}\n\nRAW OUTPUT (end):\n${log.slice(-6000)}` }],
  });
  return { who: r.who, line: r.line.trim() };
}
