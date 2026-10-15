/**
 * Unit-tests slot — default adapter: pytest, run through uv so the orchestrator
 * owns the Python environment (uv installs the right Python + deps per agent).
 */

import { execFile } from "child_process";
import os from "os";
import path from "path";
import type { UnitTestAdapter } from "../types";

function uvBin(): string {
  return process.env.UV_BIN || path.join(os.homedir(), ".local", "bin", "uv");
}

function run(cmd: string, args: string[], cwd: string, env: Record<string, string>, timeoutMs: number) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0;
        resolve({ code, out: `${stdout}${stderr}` });
      }
    );
  });
}

export async function uvAvailable(): Promise<boolean> {
  const r = await run(uvBin(), ["--version"], os.homedir(), {}, 10_000);
  return r.code === 0;
}

/** Run a Python module in the agent's env, e.g. the eval runner. */
export async function uvRunModule(dir: string, module: string, env: Record<string, string>, timeoutMs = 30 * 60_000) {
  const r = await run(uvBin(), ["run", "python", "-m", module], dir, env, timeoutMs);
  return { ok: r.code === 0, output: r.out.slice(-8000) };
}

/** `uv sync` the agent's environment. Separate from the test run so the UI can show it as its own step. */
export async function uvSync(dir: string): Promise<{ ok: boolean; output: string }> {
  const r = await run(uvBin(), ["sync", "--quiet"], dir, {}, 10 * 60_000);
  return { ok: r.code === 0, output: r.out.slice(-6000) };
}

export const pytestUv: UnitTestAdapter = {
  id: "pytest",
  slot: "unit-tests",
  label: "pytest",
  blurb: "Deterministic unit and integration tests for the agent's code and tools.",
  status: "active",
  isConnected: uvAvailable,
  async run({ dir, env, paths }) {
    const r = await run(uvBin(), ["run", "pytest", "-q", "-rA", "--tb=short", ...(paths ?? [])], dir, env, 15 * 60_000);
    const passed = Number(/(\d+) passed/.exec(r.out)?.[1] ?? 0);
    const failed = Number(/(\d+) failed/.exec(r.out)?.[1] ?? 0) + Number(/(\d+) error/.exec(r.out)?.[1] ?? 0);
    return { ok: r.code === 0, passed, failed, output: r.out.slice(-12000) };
  },
};
