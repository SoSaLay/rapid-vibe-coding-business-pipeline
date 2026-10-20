/**
 * Agent pipeline — stage 4: Security.
 *
 * Threat model (model-written, from the approved design + the built code) plus a
 * checklist. Checks the code can prove are scored deterministically; checks that
 * only exist once the agent is hosted (auth, per-user isolation) are "deferred"
 * to Deployment rather than faked as a pass. Fails need a fix or an owner-signed
 * exception before Evaluations unlocks.
 */

import { createHash } from "crypto";
import { activeProvider } from "../llm/registry";
import type { AgentDesign } from "../agent/design";
import { specToAgentText } from "./agent-design";

export type CheckStatus = "pass" | "fail" | "deferred" | "exception" | "fixed";

export interface SecurityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  exception_note?: string;
  /** Set when the AI fixed it: one line on what it changed. */
  fix_note?: string;
}

export interface ThreatModel {
  entry_points: { source: string; injected_instruction_could: string; control: string; mitigated: boolean; fix_note?: string }[];
  tool_misuse: { tool: string; worst_misuse: string; control: string }[];
}

export interface SecurityReport {
  threat_model: ThreatModel;
  checks: SecurityCheck[];
  ran_at: string;
  /** The design version the reviewed build came from (a newer build needs a new review). */
  design_version?: number;
  /** Fingerprint of what the threat model read (job, tools, prompt, tool code): unchanged → reuse it, no AI call. */
  threat_input_hash?: string;
  unapproved_consequential_tools?: string[];
}

const THREAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entry_points: {
      type: "array",
      description: "Every place untrusted text reaches the agent (emails, web pages, files, tool output).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string", description: "Where the text comes from, in plain words, at most 5 words, no tool names (e.g. 'Photo web pages', 'Uploaded Excel rows')." },
          injected_instruction_could: { type: "string", description: "What a malicious instruction hidden there could make the agent do. ONE sentence." },
          control: { type: "string", description: "What in THIS design stops it, or what's missing. ONE sentence." },
          mitigated: { type: "boolean", description: "True only if the design/code ACTUALLY contains the harm (approval gate, no such tool, narrow scope). False if any meaningful part is unmitigated." },
        },
        required: ["source", "injected_instruction_could", "control", "mitigated"],
      },
    },
    tool_misuse: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool: { type: "string" },
          worst_misuse: { type: "string", description: "ONE sentence." },
          control: { type: "string", description: "The control that stops it, or what's missing. ONE sentence." },
        },
        required: ["tool", "worst_misuse", "control"],
      },
    },
    unapproved_consequential_tools: {
      type: "array",
      description: "Names of enabled WRITE tools whose action is consequential or hard to undo but do NOT require approval.",
      items: { type: "string" },
    },
  },
  required: ["entry_points", "tool_misuse", "unapproved_consequential_tools"],
};

const SECRET_RE = /(sk-[A-Za-z0-9_-]{16,}|xox[abp]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|secret_[A-Za-z0-9]{20,})/;

export async function runSecurityReview(args: {
  design: AgentDesign;
  spec: Record<string, any>;
  files: Record<string, string>;
  /** The last report: its threat model is reused when nothing it read has changed. */
  previous?: SecurityReport;
}): Promise<SecurityReport> {
  const { design, spec, files, previous } = args;
  const tools = design.tools.filter((t) => t.enabled);
  const threatInput =
    `JOB:\n${specToAgentText(spec)}\n\nTOOLS:\n${tools.map((t) => `- ${t.name} (${t.side_effect}, approval: ${t.requires_approval}, permission: ${t.permission}): ${t.description}`).join("\n")}\n\n` +
    `SYSTEM PROMPT:\n${files["agent/prompt.py"] ?? ""}\n\nTOOL CODE:\n${(files["agent/tools.py"] ?? "").slice(0, 20000)}`;
  const hash = createHash("sha256").update(threatInput).digest("hex");
  // The threat model is the slow part (one long AI call): skip it when its inputs are the same as last time.
  const tm: ThreatModel & { unapproved_consequential_tools: string[] } =
    previous?.threat_input_hash === hash
      ? { ...previous.threat_model, unapproved_consequential_tools: previous.unapproved_consequential_tools ?? [] }
      : await activeProvider().completeJson<ThreatModel & { unapproved_consequential_tools: string[] }>({
          system:
            "You are an AI-agent security reviewer. Threat-model prompt injection and tool misuse for THIS agent. Be concrete and brief; " +
            "name the actual sources and tools. Judge controls against the design and code you're given, not best intentions.",
          effort: "high", // a big agent's threat model can outgrow the medium output cap
          schema: THREAT_SCHEMA,
          messages: [{ role: "user", content: threatInput }],
        });

  const all = Object.entries(files);
  const prompt = files["agent/prompt.py"] ?? "";
  const leaked = all.filter(([p, c]) => p !== ".env" && SECRET_RE.test(c)).map(([p]) => p);
  const gitignore = files[".gitignore"] ?? "";
  const graph = files["agent/graph.py"] ?? "";
  const approvalNames = tools.filter((t) => t.requires_approval).map((t) => t.name);
  const unapproved = (tm.unapproved_consequential_tools ?? []).filter((n) => tools.some((t) => t.name === n && !t.requires_approval));
  const noPermission = tools.filter((t) => !t.permission.trim()).map((t) => t.name);
  const sensitive = ["pii", "regulated"].includes(spec?.agent?.data_sensitivity);

  const checks: SecurityCheck[] = [
    {
      id: "approval",
      label: "Human approval on consequential writes",
      status: unapproved.length ? "fail" : approvalNames.length && !graph.includes("HumanInTheLoopMiddleware") ? "fail" : "pass",
      detail: unapproved.length
        ? `These change things and can't easily be undone, but run without approval: ${unapproved.join(", ")}. Turn on "Ask me before it runs" in Agent Design.`
        : approvalNames.length
          ? `Pauses for approval before: ${approvalNames.join(", ")}.`
          : "No consequential writes found.",
    },
    {
      id: "secrets",
      label: "Secrets kept out of prompts, code and logs",
      status: leaked.length || SECRET_RE.test(prompt) || !/^\.env$/m.test(gitignore) ? "fail" : "pass",
      detail: leaked.length
        ? `Something that looks like a key is in: ${leaked.join(", ")}.`
        : !/^\.env$/m.test(gitignore)
          ? ".env isn't gitignored."
          : "Keys are read from env only; .env is gitignored and never shown in the app.",
    },
    {
      id: "least-privilege",
      label: "Least privilege and a spending cap",
      status: noPermission.length || !(design.step_limit > 0) ? "fail" : "pass",
      detail: noPermission.length
        ? `No permission scope set for: ${noPermission.join(", ")}.`
        : `Every tool has a scoped permission; each run stops after ${design.step_limit} steps (caps spend per run).`,
    },
    {
      id: "injection",
      label: "Prompt-injection entry points have controls",
      status: tm.entry_points.every((e) => e.mitigated) ? "pass" : "fail",
      detail: tm.entry_points.every((e) => e.mitigated)
        ? `${tm.entry_points.length} entry point(s) reviewed; each has a working control.`
        : `Not fully controlled: ${tm.entry_points.filter((e) => !e.mitigated).map((e) => e.source).join("; ")}. Usually fixed by requiring approval on the tools that text could steer.`,
    },
    {
      id: "user-auth",
      label: "User authentication",
      status: "deferred",
      detail: "Only exists once the agent is hosted. Checked again at Deployment.",
    },
    {
      id: "isolation",
      label: "Each user's conversations kept separate",
      status: "deferred",
      detail: "Configured on the runtime host. Checked again at Deployment.",
    },
    {
      id: "tool-authz",
      label: "Every tool call authorized against the user's identity",
      status: "deferred",
      detail: "Needs real users (Deployment). Locally, tools act as you with your own keys.",
    },
    {
      id: "retention",
      label: "Retention policy and audit log",
      status: sensitive && !(design.retention_days! > 0) ? "fail" : "pass",
      detail:
        sensitive && !(design.retention_days! > 0)
          ? "Handles personal data, but nothing says how long hand-off records are kept."
          : design.retention_days
            ? `Hand-off records are deleted after ${design.retention_days} days; runs are traced in Langfuse.`
            : "Hand-offs are logged to handoffs.jsonl; runs are traced in Langfuse.",
    },
  ];

  return {
    threat_model: { entry_points: tm.entry_points ?? [], tool_misuse: tm.tool_misuse ?? [] },
    checks,
    ran_at: new Date().toISOString(),
    threat_input_hash: hash,
    unapproved_consequential_tools: tm.unapproved_consequential_tools ?? [],
  };
}

/** Gate: nothing left failing (deferred and owner-signed exceptions are fine). */
export function securityPasses(report: SecurityReport): boolean {
  return report.checks.every((c) => c.status !== "fail");
}
