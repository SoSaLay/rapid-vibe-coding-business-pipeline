/**
 * Local credential storage for connectors.
 * Stored under data/connectors/<id>.json — gitignored, never leaves the machine.
 */

import { promises as fs } from "fs";
import path from "path";

const CONNECTORS_ROOT = path.join(process.cwd(), "data", "connectors");

export async function saveConnectorConfig(id: string, config: Record<string, string>): Promise<void> {
  await fs.mkdir(CONNECTORS_ROOT, { recursive: true });
  await fs.writeFile(path.join(CONNECTORS_ROOT, `${id}.json`), JSON.stringify(config, null, 2), "utf8");
}

export async function readConnectorConfig(id: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(path.join(CONNECTORS_ROOT, `${id}.json`), "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}
