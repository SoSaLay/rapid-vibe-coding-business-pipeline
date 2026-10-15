/**
 * Credentials slot — default adapter: keys pasted in-app.
 * Stored per project under data/agent-credentials/<projectId>.json (gitignored),
 * injected as env when the agent runs, and copied to the host's secrets on deploy.
 */

import { promises as fs } from "fs";
import path from "path";
import type { CredentialsAdapter } from "../types";

const ROOT = path.join(process.cwd(), "data", "agent-credentials");

function file(projectId: string) {
  // Ids are UUIDs; strip anything else so a crafted id can't escape ROOT.
  return path.join(ROOT, `${projectId.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
}

async function read(projectId: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(file(projectId), "utf8"));
  } catch {
    return {};
  }
}

export const inAppCredentials: CredentialsAdapter = {
  id: "in-app",
  slot: "credentials",
  label: "Paste in-app",
  blurb: "Paste each tool's key in Agent Design. Stored locally, injected when the agent runs.",
  status: "active",
  isConnected: async () => true,
  async missing(projectId, envVars) {
    const have = await read(projectId);
    return envVars.filter((v) => v && !have[v] && !process.env[v]);
  },
  async envFor(projectId) {
    return read(projectId);
  },
  async save(projectId, values) {
    const next = { ...(await read(projectId)) };
    for (const [k, v] of Object.entries(values)) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(k)) continue;
      if (v) next[k] = v;
      else delete next[k];
    }
    await fs.mkdir(ROOT, { recursive: true });
    await fs.writeFile(file(projectId), JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  },
};
