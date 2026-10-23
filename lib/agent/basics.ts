/**
 * The agent basics: two tap-to-answer questions asked when an agent is first created, before Define
 * the Job. They settle who uses the agent (and whether they pay) and whether it's a chat agent, a
 * background agent or both, so Agent Design's "Who uses it" and the agent's own page (chat page, run
 * page or both) come straight from the owner instead of being guessed. Not asked: approvals (Agent
 * Design already puts risky writes behind approval, changeable per tool).
 */

export type AgentAudience = "me" | "team" | "customers-free" | "customers-paid";

export type AgentMode = "chat" | "background" | "both";

export interface AgentBasics {
  audience: AgentAudience;
  mode: AgentMode;
}

export const BASICS_QUESTIONS: {
  key: keyof AgentBasics;
  question: string;
  options: { id: string; label: string }[];
}[] = [
  {
    key: "audience",
    question: "Who will use this agent?",
    options: [
      { id: "me", label: "Just me" },
      { id: "team", label: "My team or company" },
      { id: "customers-free", label: "My customers (free)" },
      { id: "customers-paid", label: "My customers (paid)" },
    ],
  },
  {
    key: "mode",
    question: "How will you use this agent?",
    options: [
      { id: "chat", label: "Chat agent (you ask, it replies)" },
      { id: "background", label: "Background agent (runs a set job on its own)" },
      { id: "both", label: "Both" },
    ],
  },
];

/** A complete, valid set of answers, or null. */
export function parseBasics(raw: any): AgentBasics | null {
  if (!raw || typeof raw !== "object") return null;
  const ok = BASICS_QUESTIONS.every((q) => q.options.some((o) => o.id === raw[q.key]));
  return ok ? { audience: raw.audience, mode: raw.mode } : null;
}

export function basicsLabel(key: keyof AgentBasics, id: string): string {
  return BASICS_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.id === id)?.label ?? id;
}

/** Private to the owner: runs on their computer with no sign-in. */
export const isPersonal = (b: AgentBasics) => b.audience === "me";

/** People talk to it (chat page); false = a background agent only. */
export const isChat = (b: AgentBasics) => b.mode !== "background";

/** Runs a set job on a schedule or a Run button (run page). */
export const isBackground = (b: AgentBasics) => b.mode !== "chat";

/** Users pay for access. */
export const isPaid = (b: AgentBasics) => b.audience === "customers-paid";

/** The settled answers, for the Define the Job and Agent Design prompts. */
export function basicsText(b: AgentBasics): string {
  const where = isPersonal(b)
    ? "It's private to the owner and runs on their own computer, so no sign-in is needed."
    : `It runs online, behind a sign-in. ${isPaid(b) ? "Users pay for access." : "It's free for its users."}`;
  const how =
    b.mode === "chat"
      ? "People chat with it: each message is a new request, and it decides its steps."
      : b.mode === "background"
        ? "It runs a set job on its own (a schedule or a Run button), with the instructions built in, so nobody has to explain the job each time. Pin down the trigger and the fixed steps; prefer a workflow (fixed steps)."
        : "Both: people chat with it, and it also runs a set job on its own (a schedule or a Run button). Pin down the trigger and the set job.";
  return [
    "ALREADY SETTLED BY THE OWNER (never ask about these again; build the spec around them):",
    `- Who uses it: ${basicsLabel("audience", b.audience)}. ${where}`,
    `- How it's used: ${basicsLabel("mode", b.mode)}. ${how}`,
  ].join("\n");
}
