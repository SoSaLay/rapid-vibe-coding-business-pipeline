/** Run a command for the agent pipeline (uv, git, npx). Never throws; output is trimmed for the UI. */

import { execFile } from "child_process";
import os from "os";
import path from "path";

export function uvBin(): string {
  return process.env.UV_BIN || path.join(os.homedir(), ".local", "bin", "uv");
}

export function sh(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; timeoutMs?: number }
): Promise<{ ok: boolean; code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) }, timeout: opts.timeoutMs ?? 10 * 60_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0;
        resolve({ ok: code === 0, code, out: `${stdout}${stderr}` });
      }
    );
  });
}

/** Last JSON object printed by a CLI (our Python ops scripts print exactly one). */
export function lastJson<T = any>(out: string): T | null {
  const lines = out.trim().split("\n").reverse();
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t) as T;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/** Hide secret values if a CLI echoes them back. */
export function scrub(out: string, secrets: string[]): string {
  let s = out;
  for (const v of secrets) if (v && v.length >= 8) s = s.split(v).join("[hidden]");
  return s.slice(-6000);
}
