/**
 * Services with an official remote MCP server that apps can sign in to on their own (OAuth with dynamic
 * client registration). For these, an agent can use a sign-in instead of a pasted key: the owner signs in
 * once in a popup and the agent works through the service's MCP server.
 *
 * Checked 2026-10-20 against each server's OAuth metadata. Servers that need a pre-approved app (Stripe,
 * HubSpot, Slack, GitHub, Box, Shopify, Google Drive/Workspace, Microsoft 365) aren't here: those stay key-only.
 */

export interface McpService {
  id: string;
  label: string;
  /** The MCP server (streamable HTTP). */
  url: string;
  /** Words in a tool's credential, integration or name that mean this service. */
  match: RegExp;
  /** OAuth scope to ask for ("" = the server's default). */
  scope?: string;
  /** OAuth `resource` (RFC 8707); defaults to the server URL. */
  resource?: string;
  /** The OAuth server's metadata URL, when discovery from the MCP server doesn't find it. */
  metadata?: string;
}

export const MCP_SERVICES: McpService[] = [
  { id: "notion", label: "Notion", url: "https://mcp.notion.com/mcp", match: /\bnotion/i },
  { id: "linear", label: "Linear", url: "https://mcp.linear.app/mcp", match: /\blinear\b|linear[_ ]?(api|app)/i },
  { id: "sentry", label: "Sentry", url: "https://mcp.sentry.dev/mcp", match: /\bsentry/i },
  { id: "atlassian", label: "Jira & Confluence (Atlassian)", url: "https://mcp.atlassian.com/v1/mcp", match: /\b(jira|confluence|atlassian)/i },
  { id: "asana", label: "Asana", url: "https://mcp.asana.com/v2/mcp", match: /\basana/i },
  { id: "paypal", label: "PayPal", url: "https://mcp.paypal.com/mcp", match: /\bpaypal/i },
  { id: "square", label: "Square", url: "https://mcp.squareup.com/sse", match: /\bsquare(up)?[_ ]?(api|access|token|pos|payments)|\bsquareup/i },
  { id: "vercel", label: "Vercel", url: "https://mcp.vercel.com", match: /\bvercel/i },
  { id: "canva", label: "Canva", url: "https://mcp.canva.com/mcp", match: /\bcanva\b/i },
  { id: "intercom", label: "Intercom", url: "https://mcp.intercom.com/mcp", match: /\bintercom/i },
  { id: "webflow", label: "Webflow", url: "https://mcp.webflow.com/mcp", match: /\bwebflow/i },
  { id: "cloudflare", label: "Cloudflare", url: "https://bindings.mcp.cloudflare.com/mcp", match: /\bcloudflare/i },
  { id: "figma", label: "Figma", url: "https://mcp.figma.com/mcp", match: /\bfigma/i },
  { id: "monday", label: "monday.com", url: "https://mcp.monday.com/mcp", match: /\bmonday(\.com)?[_ ]?(api|token|board)|\bmonday\.com/i },
  { id: "airtable", label: "Airtable", url: "https://mcp.airtable.com/mcp", match: /\bairtable/i },
  { id: "tavily", label: "Tavily (web search)", url: "https://mcp.tavily.com/mcp", match: /\btavily/i },
  { id: "exa", label: "Exa (web search)", url: "https://mcp.exa.ai/mcp", match: /\bexa\b|exa[_ ]?(api|search)/i },
  { id: "apify", label: "Apify (web scraping)", url: "https://mcp.apify.com", match: /\bapify/i },
  { id: "zapier", label: "Zapier", url: "https://mcp.zapier.com/api/mcp/mcp", match: /\bzapier/i },
  { id: "dropbox", label: "Dropbox", url: "https://mcp.dropbox.com/mcp", match: /\bdropbox/i },
  { id: "clickup", label: "ClickUp", url: "https://mcp.clickup.com/mcp", match: /\bclickup/i },
  { id: "todoist", label: "Todoist", url: "https://ai.todoist.net/mcp", match: /\btodoist/i },
  { id: "wix", label: "Wix", url: "https://mcp.wix.com/mcp", match: /\bwix\b/i },
  { id: "huggingface", label: "Hugging Face", url: "https://huggingface.co/mcp", match: /hugging ?face|\bhf[_ ]?(token|api)/i },
  {
    id: "neon",
    label: "Neon",
    url: "https://mcp.neon.tech/mcp",
    match: /\bneon[_ ]?(api|db|database|postgres)/i,
    scope: "read write",
    resource: "https://mcp.neon.tech",
    metadata: "https://mcp.neon.tech/.well-known/oauth-authorization-server",
  },
  {
    id: "supabase",
    label: "Supabase",
    url: "https://mcp.supabase.com/mcp",
    match: /\bsupabase/i,
    scope: "organizations:read projects:read projects:write database:read database:write",
    metadata: "https://api.supabase.com/.well-known/oauth-authorization-server",
  },
];

export function mcpService(id: string): McpService | undefined {
  return MCP_SERVICES.find((s) => s.id === id);
}

/** The service a tool's credential belongs to, when it has a sign-in-able MCP server. */
export function mcpServiceFor(...texts: (string | undefined)[]): McpService | undefined {
  const text = texts.filter(Boolean).join(" ").replace(/_/g, " ");
  return MCP_SERVICES.find((s) => s.match.test(text));
}

/** Env var prefix for a service's sign-in, e.g. NOTION_MCP. */
export const mcpEnvPrefix = (id: string) => `${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_MCP`;
