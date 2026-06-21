/**
 * Phase 10 — Operations & Maintenance (optional/skippable).
 *
 * The solo-founder ops director. The core deliverable is a RECURRING,
 * tool-grouped checklist tailored to exactly what this app was deployed
 * with (from stack-selection + deploy-manifest): "go into Supabase and
 * check X weekly, go into AWS and check Y daily" — each item with a
 * cadence timer that resets after it's checked off (24h / 7d / 30d),
 * plus a deep link into each tool's console. Like the Phase 9 posting
 * loop, the checklist stays live after sign-off — ops never "finishes".
 *
 * Also produces a release process + incident response runbook, writes
 * OPS-GUIDE.md to the app workspace, and emits the `ops-report` artifact.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { writeWorkspaceFile } from "../workspace";
import { StackChoice, stackToText } from "../stack";
import { Cadence } from "../ops-cadence";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface OpsCheck {
  id: string;
  title: string;
  how: string;
  cadence: Cadence;
}

export interface OpsTool {
  name: string;
  url: string;
  role: string;
  checks: OpsCheck[];
}

export interface ReleaseStep {
  step: string;
  detail: string;
}

export interface IncidentStep {
  step: string;
  detail: string;
}

export interface OpsReport {
  summary: string;
  tools: OpsTool[];
  release_process: ReleaseStep[];
  incident_response: IncidentStep[];
}

/** itemId → ISO timestamp of the last time the owner checked it off. */
export type CheckLog = Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Schema                                                              */
/* ------------------------------------------------------------------ */

const OPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description:
        "2-3 sentences: what's running, which tools/platforms it lives on, and the single most important ops habit for this founder.",
    },
    tools: {
      type: "array",
      description:
        "One entry per tool/platform the app ACTUALLY uses (from the stack + deploy manifest). Never include a tool that isn't in their stack.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Tool name, e.g. 'AWS Amplify', 'Supabase', 'GitHub'." },
          url: {
            type: "string",
            description:
              "Direct console/dashboard URL the owner clicks to do these checks. Use the real ids from the deploy manifest where given.",
          },
          role: { type: "string", description: "One line: what this tool does in THEIR app." },
          checks: {
            type: "array",
            description:
              "2-5 recurring checks for this tool. Each one is a concrete thing to look at inside that console, with a daily/weekly/monthly cadence.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", description: "Short stable slug, e.g. 'amplify-build-status'." },
                title: { type: "string", description: "What to check, imperative, e.g. 'Check last build succeeded'." },
                how: {
                  type: "string",
                  description:
                    "Exactly where to look in that console and what bad looks like (the threshold that means act now).",
                },
                cadence: { type: "string", enum: ["daily", "weekly", "monthly"] },
              },
              required: ["id", "title", "how", "cadence"],
            },
          },
        },
        required: ["name", "url", "role", "checks"],
      },
    },
    release_process: {
      type: "array",
      description: "Ordered steps for shipping a code update safely (git branches → auto-deploy).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          step: { type: "string" },
          detail: { type: "string" },
        },
        required: ["step", "detail"],
      },
    },
    incident_response: {
      type: "array",
      description: "Ordered steps one person can run when something breaks: detect → triage → fix → verify → communicate.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          step: { type: "string" },
          detail: { type: "string" },
        },
        required: ["step", "detail"],
      },
    },
  },
  required: ["summary", "tools", "release_process", "incident_response"],
};

/* ------------------------------------------------------------------ */
/*  System prompt                                                       */
/* ------------------------------------------------------------------ */

const OPS_SYSTEM = `You are the ops director for a solo founder's just-deployed product.

Your core deliverable is a RECURRING CHECKLIST grouped by tool: based on what they actually deployed
with, tell them exactly what to check inside each tool's console and how often. They will work
through this checklist on daily / weekly / monthly timers, so every item must be:
- Tied to ONE specific tool in THEIR stack (never a tool they don't use).
- A concrete look-at-this-screen action, not advice. Name the tab/section inside the console and
  what "bad" looks like (the threshold that means act now).
- Honest about cadence. Daily = only things that catch customer-impacting breakage (build failed,
  error spike, site down). Weekly = health and security review (auth failures, DB usage, npm audit).
  Monthly = hygiene (costs, backups, dependency updates, key rotation). A solo founder's daily list
  must stay under ~5 minutes — be ruthless.

Tool URLs — use the real identifiers from the deploy manifest, with these console patterns:
- AWS Amplify console: https://<region>.console.aws.amazon.com/amplify/apps/<app_id>/overview
- AWS CloudWatch: https://<region>.console.aws.amazon.com/cloudwatch/home?region=<region>
- AWS Billing: https://console.aws.amazon.com/billing/home
- Supabase dashboard: https://supabase.com/dashboard (project-specific URL unknown — top level is fine)
- GitHub: the repo URL from the manifest
- Clerk: https://dashboard.clerk.com · Stripe: https://dashboard.stripe.com
- Resend (email broadcasts): https://resend.com/emails · https://resend.com/broadcasts · https://resend.com/domains
Include a Resend tool entry ONLY when "Email enabled: yes" is set below (the founder opted this
product into email). Its checks: weekly — review bounce/complaint rate on recent sends (a rising
rate hurts deliverability); monthly — confirm the sending domain is still verified (resend.com/domains)
and rotate the API key. If email is not enabled, do NOT mention Resend at all.
Group AWS surfaces sensibly: Amplify gets its own tool entry; CloudWatch/Billing checks can live
under an "AWS (CloudWatch & Billing)" entry if you need them. 3-6 tool entries total.
Also include a "Your live app" entry (url = the prod URL) with the simplest check of all: open it,
log in, click through the core flow like a customer would.

After the checklist, give:
- release_process: the safe way to ship an update with their git-branch → auto-deploy setup
  (test on dev, smoke UAT, merge to main, verify prod). Repeatable by a tired person at midnight.
- incident_response: a 5-ish step loop for when something breaks. First step is always: confirm
  whether customers are affected right now.

Everything must be runnable by ONE person with no DevOps team and no new tools beyond what they
already deployed with.`;

/* ------------------------------------------------------------------ */
/*  Context builders                                                    */
/* ------------------------------------------------------------------ */

function deployContext(deploy: Record<string, any>): string {
  const lines: string[] = ["DEPLOY MANIFEST:"];
  if (deploy.summary) lines.push(`Summary: ${deploy.summary}`);
  const envs: any[] = deploy.environments || [];
  for (const e of envs) {
    lines.push(`- ${e.name}: ${e.url ?? "pending"} (branch: ${e.branch ?? "?"})`);
  }
  if (deploy.app_id) lines.push(`AWS Amplify app_id: ${deploy.app_id}`);
  if (deploy.region) lines.push(`Region: ${deploy.region}`);
  if (deploy.waf_enabled != null) lines.push(`WAF: ${deploy.waf_enabled ? "enabled" : "disabled"}`);
  if (deploy.custom_domain) lines.push(`Custom domain: ${deploy.custom_domain}`);
  if (deploy.github_repo) lines.push(`GitHub repo: ${deploy.github_repo}`);
  if (deploy.outstanding_todos?.length) {
    lines.push(`Outstanding human to-dos at deploy: ${deploy.outstanding_todos.join("; ")}`);
  }
  return lines.join("\n");
}

function specContext(spec: Record<string, any>, ideaType?: string): string {
  const parts: string[] = [];
  if (spec.summary) parts.push(`App summary: ${spec.summary}`);
  if (spec.problem_statement) parts.push(`Problem being solved: ${spec.problem_statement}`);
  if (spec.must_have_features?.length)
    parts.push(`Core features: ${spec.must_have_features.map((f: any) => f.name).join(", ")}`);
  if (ideaType) parts.push(ideaTypeContext(ideaType));
  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Generation                                                          */
/* ------------------------------------------------------------------ */

export async function generateOpsReport(
  deploy: Record<string, any>,
  spec: Record<string, any> | null,
  stackChoices: StackChoice[] | null,
  ideaType?: string,
  emailEnabled?: boolean
): Promise<OpsReport> {
  const provider = activeProvider();
  const contextParts = [deployContext(deploy)];
  if (stackChoices?.length) contextParts.push(`DEPLOYED TECH STACK:\n${stackToText(stackChoices)}`);
  if (spec) contextParts.push(specContext(spec, ideaType));
  contextParts.push(`Email enabled: ${emailEnabled ? "yes (founder broadcasts via Resend)" : "no"}`);

  const result = await provider.completeJson<OpsReport>({
    system: OPS_SYSTEM,
    effort: "high",
    schema: OPS_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          contextParts.join("\n\n") +
          "\n\nGenerate the ops report. The recurring checklist must cover ONLY the tools in this stack, " +
          "with real console URLs from the manifest ids. Keep the daily load under 5 minutes total.",
      },
    ],
  });

  return withStableIds(result);
}

/** Re-key every check with a deterministic unique id (LLM slugs can collide). */
export function withStableIds(report: OpsReport): OpsReport {
  return {
    ...report,
    tools: (report.tools ?? []).map((tool, ti) => ({
      ...tool,
      checks: (tool.checks ?? []).map((c, ci) => ({ ...c, id: `t${ti}_c${ci}_${c.cadence}` })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  OPS-GUIDE.md writer (goes to the app workspace)                    */
/* ------------------------------------------------------------------ */

export function renderOpsGuide(report: OpsReport, prodUrl: string): string {
  const lines: string[] = [
    "# OPS-GUIDE.md",
    "",
    "> Auto-generated by the Rapid Vibe Coding Pipeline — Phase 10: Operations & Maintenance.",
    "> The live recurring checklist (with cadence timers) lives in the pipeline; this file is the",
    "> portable reference copy.",
    "",
    "---",
    "",
    "## Summary",
    "",
    report.summary,
    "",
    "---",
    "",
    "## Recurring Checklist (by tool)",
    "",
  ];
  for (const tool of report.tools) {
    lines.push(`### ${tool.name}`, "", `${tool.role}`, "", `Console: ${tool.url}`, "");
    lines.push("| Check | How / when to act | Cadence |", "|-------|-------------------|---------|");
    for (const c of tool.checks) lines.push(`| ${c.title} | ${c.how} | ${c.cadence} |`);
    lines.push("");
  }
  lines.push(
    "---",
    "",
    "## Release Process",
    "",
    ...report.release_process.map((s, i) => `${i + 1}. **${s.step}** — ${s.detail}`),
    "",
    "---",
    "",
    "## Incident Response",
    "",
    ...report.incident_response.map((s, i) => `${i + 1}. **${s.step}** — ${s.detail}`),
    "",
    "---",
    "",
    `*Generated ${new Date().toISOString().slice(0, 10)} · Prod: ${prodUrl}*`
  );
  return lines.join("\n");
}

export async function writeOpsGuide(
  projectTitle: string,
  report: OpsReport,
  prodUrl: string
): Promise<void> {
  await writeWorkspaceFile(projectTitle, "OPS-GUIDE.md", renderOpsGuide(report, prodUrl));
}
