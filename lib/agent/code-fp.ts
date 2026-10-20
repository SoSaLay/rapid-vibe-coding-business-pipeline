/**
 * A fingerprint of the code that decides how an agent behaves (its agent/ package, skills, documents and
 * dependencies). Test runs pass it to the eval runner as EVAL_CODE_FP so a case that already passed on this
 * exact code isn't paid for again, and the live check can tell whether the full set already passed on it.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const DIRS = ["agent", "skills", "knowledge"];
const FILES = ["pyproject.toml", "uv.lock"];

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    if (e.name === "__pycache__" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (!e.name.endsWith(".pyc")) out.push(p);
  }
  return out;
}

export async function codeFingerprint(agentDir: string): Promise<string> {
  const files = [
    ...(await Promise.all(DIRS.map((d) => walk(path.join(agentDir, d))))).flat(),
    ...FILES.map((f) => path.join(agentDir, f)),
  ].sort();
  const h = createHash("sha256");
  for (const f of files) {
    const body = await fs.readFile(f).catch(() => null);
    if (!body) continue;
    h.update(path.relative(agentDir, f)).update("\0").update(body).update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
