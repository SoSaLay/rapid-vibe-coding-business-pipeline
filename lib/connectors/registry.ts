/**
 * Connector registry. Notion is active and fully wired; the others share the
 * exact same Connector shape and ship as "coming_soon" stubs so cloning the
 * Notion behavior onto them later is near-zero rework.
 */

import { Connector, ConnectorInfo } from "./types";
import { notionConnector } from "./notion";

function comingSoon(id: string, name: string): Connector {
  return {
    id,
    name,
    status: "coming_soon",
    authKind: "token",
    async isConfigured() {
      return false;
    },
    async configure() {
      return { ok: false, error: `${name} connector is not implemented yet.` };
    },
    async listSources() {
      return [];
    },
    async fetchContext() {
      throw new Error(`${name} connector is not implemented yet.`);
    },
  };
}

export const CONNECTORS: Connector[] = [
  notionConnector,
  comingSoon("clickup", "ClickUp"),
  comingSoon("jira", "Jira"),
  comingSoon("asana", "Asana"),
  comingSoon("linear", "Linear"),
  comingSoon("trello", "Trello"),
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export async function listConnectorInfo(): Promise<ConnectorInfo[]> {
  return Promise.all(
    CONNECTORS.map(async (c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      authKind: c.authKind,
      configured: c.status === "active" ? await c.isConfigured() : false,
    }))
  );
}
