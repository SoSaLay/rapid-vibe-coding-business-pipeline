/**
 * Generic project-management connector contract.
 *
 * Every intake source (Notion, ClickUp, Jira, ...) implements this identical
 * shape so a new tool drops in without touching the rest of the pipeline.
 * Phase 1 ("pull from a tool") only depends on this interface.
 */

export interface ConnectorSource {
  id: string;
  title: string;
  type: "database" | "page" | "list" | "board";
  url?: string;
  icon?: string;
}

export interface ConnectorContext {
  sourceId: string;
  title: string;
  /** Flattened text the AI ingests as the raw idea. */
  text: string;
  url?: string;
  /** Original structured payload, kept for traceability. */
  raw?: unknown;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  /** How the user connects, e.g. "token" | "oauth". */
  authKind: "token" | "oauth";
  configured: boolean;
}

export interface Connector {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  authKind: "token" | "oauth";

  /** Has the user supplied valid credentials yet? */
  isConfigured(): Promise<boolean>;
  /** Persist credentials (e.g. an integration token). */
  configure(credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  /** Databases / pages / lists the user can pick an idea from. */
  listSources(): Promise<ConnectorSource[]>;
  /** Pull the selected source's content into ingestible text. */
  fetchContext(sourceId: string): Promise<ConnectorContext>;
}
