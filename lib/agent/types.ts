/**
 * Agent-pipeline slot contracts (see release-deployment.md → "The slots").
 *
 * Every stage asks for a SLOT, never a vendor. LangChain-ecosystem tools are the
 * default adapters, not hard dependencies: a new tool is one adapter file
 * registered in ./registry.ts, and no stage code changes.
 */

import type { AgentDesign } from "./design";

export type AgentSlot =
  | "framework"
  | "credentials"
  | "approval"
  | "tracing"
  | "auth"
  | "unit-tests"
  | "evals"
  | "runtime"
  | "chat-ui"
  | "web-host"
  | "ci"
  | "monitoring";

export interface AgentAdapter {
  id: string;
  slot: AgentSlot;
  label: string;
  blurb: string;
  /** "active" = wired and usable; "planned" = listed so the toolbox shows it, not wired yet. */
  status: "active" | "planned";
  /** True when the adapter can run right now (key present, or no key needed). */
  isConnected(): Promise<boolean>;
  /** Other slots this adapter only works with, e.g. Agent Chat UI needs a LangGraph-compatible runtime. */
  requires?: { slot: AgentSlot; adapterIds: string[]; reason: string }[];
}

/** A file the framework adapter writes into the agent's workspace. */
export interface GeneratedFile {
  path: string;
  content: string;
  /** Plain-language "what this part does", shown on the Your codebase view. */
  explains: string;
}

/** Code written by the model for the parts a template can't know (tool bodies, the system prompt). */
export interface FilledLogic {
  system_prompt: string;
  tools: { name: string; python_body: string }[];
  /** Extra pip packages the tool bodies import, e.g. "google-api-python-client". */
  extra_dependencies: string[];
  /**
   * Per example task: the message the agent actually receives (in its real input
   * shape) and canned tool responses for the test run, so example tests are
   * hermetic — no real inbox or API needed.
   */
  examples: { index: number; run_input: string; fixtures: { tool: string; response: string }[] }[];
}

export interface FrameworkAdapter extends AgentAdapter {
  slot: "framework";
  /** Language of the generated agent. */
  language: "python";
  /** Render the deterministic skeleton + filled logic into files. Pure — no I/O. */
  render(args: { title: string; design: AgentDesign; logic: FilledLogic; exampleTasks: ExampleTask[]; spec?: Record<string, any> }): GeneratedFile[];
}

export interface ExampleTask {
  input: string;
  expected: string;
}

export interface CredentialsAdapter extends AgentAdapter {
  slot: "credentials";
  /** Env var names the agent's tools need that are still missing for this project. */
  missing(projectId: string, envVars: string[]): Promise<string[]>;
  /** Values to inject as env when running or deploying the agent. Never logged. */
  envFor(projectId: string): Promise<Record<string, string>>;
  save(projectId: string, values: Record<string, string>): Promise<void>;
}

export interface UnitTestAdapter extends AgentAdapter {
  slot: "unit-tests";
  /** Run the agent's test suite in its workspace. */
  run(args: { dir: string; env: Record<string, string>; paths?: string[] }): Promise<TestRun>;
}

export interface TestRun {
  ok: boolean;
  passed: number;
  failed: number;
  output: string;
}
