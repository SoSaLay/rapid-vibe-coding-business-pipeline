/**
 * Notion connector — the primary, fully-wired intake source.
 *
 * The user connects with a Notion internal integration token (the free option:
 * notion.so/my-integrations → New integration → copy "Internal Integration Secret",
 * then share the target pages/databases with that integration). We then let them
 * pick a database or page, and we flatten its content into ingestible text.
 */

import { Client } from "@notionhq/client";
import { Connector, ConnectorContext, ConnectorSource } from "./types";
import { readConnectorConfig, saveConnectorConfig } from "./config";

const ID = "notion";

async function getClient(): Promise<Client | null> {
  const config = await readConnectorConfig(ID);
  if (!config?.token) return null;
  return new Client({ auth: config.token });
}

function richTextToPlain(rich: any[] | undefined): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((r) => r?.plain_text ?? "").join("");
}

function titleOf(obj: any): string {
  // pages: properties[*].type === 'title'; databases: top-level title array
  if (obj?.object === "database") return richTextToPlain(obj.title) || "Untitled database";
  const props = obj?.properties ?? {};
  for (const key of Object.keys(props)) {
    if (props[key]?.type === "title") {
      const t = richTextToPlain(props[key].title);
      if (t) return t;
    }
  }
  return "Untitled";
}

function blockToText(block: any): string {
  const type = block?.type;
  if (!type) return "";
  const data = block[type];
  const text = richTextToPlain(data?.rich_text);
  switch (type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
    case "numbered_list_item":
      return `- ${text}`;
    case "to_do":
      return `- [${data?.checked ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return "```\n" + text + "\n```";
    default:
      return text;
  }
}

export const notionConnector: Connector = {
  id: ID,
  name: "Notion",
  status: "active",
  authKind: "token",

  async isConfigured() {
    const client = await getClient();
    if (!client) return false;
    try {
      await client.users.me({});
      return true;
    } catch {
      return false;
    }
  },

  async configure(credentials) {
    const token = credentials.token?.trim();
    if (!token) return { ok: false, error: "Missing integration token." };
    try {
      const client = new Client({ auth: token });
      await client.users.me({});
      await saveConnectorConfig(ID, { token });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Invalid token or no access." };
    }
  },

  async listSources() {
    const client = await getClient();
    if (!client) return [];
    const res = await client.search({ page_size: 100, sort: { direction: "descending", timestamp: "last_edited_time" } });
    const sources: ConnectorSource[] = [];
    for (const item of res.results as any[]) {
      if (item.object === "database") {
        sources.push({ id: item.id, title: titleOf(item), type: "database", url: item.url });
      } else if (item.object === "page" && item.parent?.type !== "database_id") {
        // top-level pages (skip database rows to keep the picker clean)
        sources.push({ id: item.id, title: titleOf(item), type: "page", url: item.url });
      }
    }
    return sources;
  },

  async fetchContext(sourceId): Promise<ConnectorContext> {
    const client = await getClient();
    if (!client) throw new Error("Notion is not connected.");

    // Try as a page first; fall back to database.
    try {
      const page: any = await client.pages.retrieve({ page_id: sourceId });
      const title = titleOf(page);
      const lines: string[] = [];
      let cursor: string | undefined;
      do {
        const children: any = await client.blocks.children.list({ block_id: sourceId, start_cursor: cursor, page_size: 100 });
        for (const block of children.results) {
          const t = blockToText(block);
          if (t) lines.push(t);
        }
        cursor = children.has_more ? children.next_cursor : undefined;
      } while (cursor);
      return { sourceId, title, text: lines.join("\n"), url: page.url, raw: page };
    } catch {
      const db: any = await client.databases.retrieve({ database_id: sourceId });
      const title = titleOf(db);
      const query: any = await client.databases.query({ database_id: sourceId, page_size: 50 });
      const rows = (query.results as any[]).map((r) => `- ${titleOf(r)}`);
      const text = [`Database: ${title}`, "", ...rows].join("\n");
      return { sourceId, title, text, url: db.url, raw: { database: db, rows: query.results } };
    }
  },
};
