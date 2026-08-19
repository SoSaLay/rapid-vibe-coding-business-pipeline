/**
 * Phase 9 — Marketing & Sales (optional/skippable).
 *
 * The marketing director for a solo first-time founder: lean by design
 * (2-3 channels max, organic content first, NO paid ads at this stage), the
 * human posts, the pipeline does the thinking and writing. Consumes
 * deploy-manifest (+ audience-brief / market-report / design-spec branding /
 * Phase-4 content library when present) and produces `campaign-report`.
 *
 * Stages: campaign plan (channels, pillars, weekly rhythm, in-depth launch
 * checklist, waitlist email) → content batches (2 weeks of ready-to-post
 * content) → the daily posting loop (Today view, copy → posted ✓, streaks)
 * → launch + sign-off. The loop keeps working after the phase completes —
 * marketing never "finishes"; the gate only means "launched, system running".
 *
 * Strategy layer distilled from EdoStra/Marketing-for-Founders (CC BY-SA,
 * credited in README) + the vendored playbooks (marketing-skills,
 * social-media-skills, email-campaigns-claude — see vendor/ ATTRIBUTIONs).
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { buildFrameworkContext, frameworkCatalog } from "../frameworks";
import { SKIMMABLE_STYLE } from "./brevity";

/* ---------------- Framework sets (fixed per task, filtered to what's vendored) ---------------- */

const STRATEGY_FRAMEWORKS = ["marketing-plan", "content-strategy", "social", "community-marketing", "marketing-ideas", "launch"];
const CRAFT_FRAMEWORKS = ["voice-builder", "hook-generator", "post-writer", "post-scorer", "content-matrix", "reels-scripting", "social"];
const EMAIL_FRAMEWORKS = ["email-campaigns", "emails", "copywriting"];

async function frameworksFor(ids: string[]): Promise<string> {
  const available = new Set((await frameworkCatalog()).map((f) => f.id));
  return buildFrameworkContext(ids.filter((id) => available.has(id)));
}

/* ---------------- Plan types + schema ---------------- */

export interface CampaignChannel {
  name: string;
  why_this_channel: string;
  audience_mindset: string;
  content_types: string[];
  cadence: string;
}

export interface ContentPillar {
  name: string;
  description: string;
  example_angles: string[];
}

export interface RhythmSlot {
  day: string;
  channel: string;
  format: string;
}

export interface LaunchChecklistItem {
  id: string;
  stage: "prep" | "launch_week" | "momentum";
  title: string;
  why: string;
  how: string;
}

export interface WaitlistEmail {
  subject: string;
  preview_text: string;
  body_markdown: string;
}

export interface CampaignPlan {
  strategy_summary: string;
  channels: CampaignChannel[];
  content_pillars: ContentPillar[];
  weekly_rhythm: RhythmSlot[];
  launch_checklist: LaunchChecklistItem[];
  waitlist_email: WaitlistEmail | null;
  metrics_to_watch: string[];
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    strategy_summary: { type: "string", description: "The whole go-to-market in AT MOST 3 sentences, plain language. Lead with the play, not the context." },
    channels: {
      type: "array",
      description: "EXACTLY 2-3 channels. Fewer done consistently beats many done badly — this cap is policy, not advice.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "e.g. 'X (Twitter)', 'LinkedIn', 'Short-form video', 'Forums/communities'." },
          why_this_channel: { type: "string", description: "Why THIS audience is reachable here — cite the research when it exists. ONE sentence." },
          audience_mindset: { type: "string" },
          content_types: { type: "array", items: { type: "string" } },
          cadence: { type: "string", description: "Realistic for one busy human, e.g. '3x/week'." },
        },
        required: ["name", "why_this_channel", "audience_mindset", "content_types", "cadence"],
      },
    },
    content_pillars: {
      type: "array",
      description: "3-4 recurring themes the founder can post about forever without running dry.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          example_angles: { type: "array", items: { type: "string" }, description: "3-5 concrete angles inside this pillar." },
        },
        required: ["name", "description", "example_angles"],
      },
    },
    weekly_rhythm: {
      type: "array",
      description: "The repeating weekly schedule. One entry per posting slot; days as Mon/Tue/…; total slots must match the channel cadences.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string", description: "Mon | Tue | Wed | Thu | Fri | Sat | Sun" },
          channel: { type: "string" },
          format: { type: "string" },
        },
        required: ["day", "channel", "format"],
      },
    },
    launch_checklist: {
      type: "array",
      description:
        "The COMPLETE first-launch playbook for a first-time founder — every move from announcement to first sales. " +
        "15-25 items across the three stages. Each item names the actual place/action for THIS product (real directories, " +
        "real communities with the angle to use, the actual ask). 'how' must be doable in one sitting.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "LC1, LC2, …" },
          stage: { type: "string", enum: ["prep", "launch_week", "momentum"] },
          title: { type: "string", description: "Imperative, specific." },
          why: { type: "string", description: "One line: what this buys you." },
          how: { type: "string", description: "Exactly what to do — concrete enough to execute without research. AT MOST 2 sentences." },
        },
        required: ["id", "stage", "title", "why", "how"],
      },
    },
    waitlist_email: {
      type: ["object", "null"],
      additionalProperties: false,
      description: "The launch announcement to the waitlist. null ONLY if there is no waitlist.",
      properties: {
        subject: { type: "string" },
        preview_text: { type: "string" },
        body_markdown: { type: "string", description: "Full email body, markdown. Warm, short, one clear CTA to the live product." },
      },
      required: ["subject", "preview_text", "body_markdown"],
    },
    metrics_to_watch: {
      type: "array",
      items: { type: "string" },
      description: "3-5 numbers worth checking weekly, and what each tells you. No vanity metrics.",
    },
  },
  required: ["strategy_summary", "channels", "content_pillars", "weekly_rhythm", "launch_checklist", "waitlist_email", "metrics_to_watch"],
};

/**
 * Distilled from Marketing-for-Founders (EdoStra, CC BY-SA) + first-launch
 * fundamentals. This is the strategy spine of the campaign-plan prompt.
 */
const FOUNDER_MARKETING_GUIDANCE = `Founder go-to-market principles (apply, don't recite):
- Distribution beats creation: post where the audience ALREADY gathers; don't build an audience from zero on a platform they're not on.
- Launch in multiple places in the same week (Product Hunt, niche directories, relevant subreddits/communities, the waitlist) — momentum compounds; a trickle launch dies quietly.
- Communities punish ads-in-disguise: lead with the problem and the story, mention the product as the resolution, follow each community's self-promo norms.
- Low-cost before paid: organic content, communities, cold-but-personal outreach, and SEO foundations come before a single ad dollar. Paid ads are OUT OF SCOPE at this stage.
- Mini free tools out-market free trials (10x the backlinks and shares) — when this product could ship a tiny free tool as a lead magnet, say so in the checklist.
- The founder's personal account usually outperforms a brand account early — people follow people.
- Conversion is part of marketing: every channel needs a next step (visit → sign up → activate → pay). The checklist must cover the SALES half: pricing page sanity, onboarding follow-up, asking early users for testimonials, direct outreach to the first 10 customers, and replying to every single comment/DM.
- Consistency is the strategy: a sustainable weekly rhythm kept for months beats a heroic burst kept for a week.`;

function specToText(spec: Record<string, any>): string {
  const f = (arr: any[]) => (Array.isArray(arr) ? arr.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Must-have features: ${(spec.must_have_features || []).map((x: any) => `${x.name}: ${x.description || ""}`).join("; ")}`,
    ideaTypeContext(spec.idea_type),
  ].join("\n");
}

export interface CampaignContext {
  spec: Record<string, any>;
  productTitle: string;
  prodUrl: string;
  /** Phase 4 audience-brief payload, when the phase ran. */
  audienceBrief: Record<string, any> | null;
  /** Phase 3 market-report payload, when the phase ran. */
  marketReport: Record<string, any> | null;
  /** Phase 4 kit slices (positioning + content_library), when present. */
  positioning: Record<string, any> | null;
  contentLibrary: any[] | null;
  /** Phase 5 branding (voice/personality), when present. */
  branding: Record<string, any> | null;
  /** Whether a Phase 4 waitlist exists (drives the launch email). */
  hasWaitlist: boolean;
}

function contextToText(ctx: CampaignContext): string {
  const parts = [
    `PRODUCT: ${ctx.productTitle} — LIVE at ${ctx.prodUrl}`,
    `SPEC:\n${specToText(ctx.spec)}`,
  ];
  if (ctx.branding) {
    parts.push(
      `BRAND VOICE (from the design spec — every word of content must sound like this):\n` +
        `${ctx.branding.name || ctx.productTitle} — ${ctx.branding.tagline || ""}; personality: ${ctx.branding.personality || ""}; voice: ${ctx.branding.voice || ""}`
    );
  }
  if (ctx.positioning) parts.push(`VALIDATED POSITIONING (Phase 4):\n${JSON.stringify(ctx.positioning).slice(0, 1500)}`);
  if (ctx.audienceBrief) parts.push(`AUDIENCE BRIEF (what pre-marketing learned):\n${JSON.stringify(ctx.audienceBrief).slice(0, 2000)}`);
  if (ctx.marketReport) {
    const m = ctx.marketReport;
    parts.push(
      `MARKET RESEARCH SIGNALS:\nWhere the audience hangs out + voice-of-customer: ${JSON.stringify({
        themes: m.themes,
        positioning: m.positioning,
        target_segments: m.target_segments,
      }).slice(0, 2000)}`
    );
  }
  if (ctx.contentLibrary?.length) {
    parts.push(
      `PHASE-4 CONTENT LIBRARY (evergreen per-platform direction — build on it, don't contradict it):\n${JSON.stringify(ctx.contentLibrary).slice(0, 3000)}`
    );
  }
  parts.push(`WAITLIST: ${ctx.hasWaitlist ? "exists (Phase 4 Supabase waitlist) — write the launch email" : "none — waitlist_email must be null"}`);
  return parts.join("\n\n");
}

export async function generateCampaignPlan(ctx: CampaignContext, extraContext = ""): Promise<CampaignPlan> {
  const provider = activeProvider();
  const frameworks = await frameworksFor([...STRATEGY_FRAMEWORKS, ...EMAIL_FRAMEWORKS]);
  return provider.completeJson<CampaignPlan>({
    system:
      "You are a lean go-to-market director for a solo first-time founder who just shipped an MVP. They have " +
      "~10 minutes a day for marketing and zero budget for ads. Your plan must be executable by ONE busy human: " +
      "2-3 channels, a sustainable weekly rhythm, and an exhaustive launch checklist that takes them from " +
      "'nobody knows this exists' to 'first paying users' without assuming any marketing experience.\n\n" +
      FOUNDER_MARKETING_GUIDANCE +
      "\n\n" +
      frameworks +
      `\n\n${SKIMMABLE_STYLE}` +
      extraContext,
    effort: "high",
    schema: PLAN_SCHEMA,
    messages: [{ role: "user", content: contextToText(ctx) + "\n\nProduce the campaign plan." }],
  });
}

/* ---------------- Content batches ---------------- */

export interface ContentPost {
  id: string;
  date: string; // YYYY-MM-DD
  channel: string;
  pillar: string;
  format: string;
  hook: string;
  body: string;
  cta: string;
}

const BATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    posts: {
      type: "array",
      description:
        "One post per rhythm slot across the 14 days, dated to the actual calendar. Every post is FINAL copy — " +
        "ready to paste, formatted for its platform (line breaks for X, white space for LinkedIn, spoken script for " +
        "short-form video), live URL worked in naturally. Rotate pillars; no two posts may share an angle.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "Unique, e.g. P-2026-06-15-x1." },
          date: { type: "string", description: "YYYY-MM-DD, matching a rhythm day in the window." },
          channel: { type: "string" },
          pillar: { type: "string" },
          format: { type: "string" },
          hook: { type: "string", description: "The first line — must earn the next line." },
          body: { type: "string", description: "The full post (or script), paste-ready. Hook included at the top." },
          cta: { type: "string", description: "The one action this post asks for." },
        },
        required: ["id", "date", "channel", "pillar", "format", "hook", "body", "cta"],
      },
    },
  },
  required: ["posts"],
};

export async function generateContentBatch(args: {
  plan: CampaignPlan;
  ctx: CampaignContext;
  startDate: string; // YYYY-MM-DD (first day of the 14-day window)
  recentHooks: string[]; // hooks from prior batches — repetition guard
}): Promise<ContentPost[]> {
  const provider = activeProvider();
  const frameworks = await frameworksFor(CRAFT_FRAMEWORKS);
  const result = await provider.completeJson<{ posts: ContentPost[] }>({
    system:
      "You are a content writer producing the next two weeks of posts for a solo founder. Quality bar (apply the " +
      "post-scorer playbook to every post before including it): a stranger should stop scrolling at the hook, get " +
      "real value or a real story from the body, and know exactly what to do next. Sound like the brand voice — " +
      "a person, never a press release. No hashtag walls, no emoji soup, no 'excited to announce'.\n\n" +
      frameworks,
    effort: "high",
    schema: BATCH_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          contextToText(args.ctx) +
          `\n\nCAMPAIGN PLAN:\n${JSON.stringify({ channels: args.plan.channels, content_pillars: args.plan.content_pillars, weekly_rhythm: args.plan.weekly_rhythm }, null, 2)}` +
          `\n\n14-DAY WINDOW STARTS: ${args.startDate} (map rhythm days to real dates from this start).` +
          (args.recentHooks.length
            ? `\n\nALREADY-USED HOOKS (do not repeat these angles):\n${args.recentHooks.slice(-30).map((h) => `- ${h}`).join("\n")}`
            : "") +
          "\n\nWrite the batch.",
      },
    ],
  });
  return result.posts || [];
}

/* ---------------- Posting stats (deterministic) ---------------- */

export interface PostingStats {
  due_to_date: number;
  posted: number;
  this_week_due: number;
  this_week_posted: number;
  streak_days: number;
}

/** Streak = consecutive calendar days (ending today or yesterday) where every due post was marked posted. */
export function computePostingStats(posts: ContentPost[], postedIds: string[], todayIso: string): PostingStats {
  const posted = new Set(postedIds);
  const today = todayIso.slice(0, 10);
  const byDate = new Map<string, ContentPost[]>();
  for (const p of posts) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date)!.push(p);
  }

  const dueToDate = posts.filter((p) => p.date <= today);
  const weekStart = new Date(today + "T00:00:00Z");
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)); // Monday
  const ws = weekStart.toISOString().slice(0, 10);
  const thisWeekDue = posts.filter((p) => p.date >= ws && p.date <= today);

  let streak = 0;
  const d = new Date(today + "T00:00:00Z");
  for (let i = 0; i < 365; i++) {
    const iso = d.toISOString().slice(0, 10);
    const due = byDate.get(iso) || [];
    if (due.length > 0) {
      const allDone = due.every((p) => posted.has(p.id));
      if (allDone) streak++;
      else if (iso === today) {
        /* today not finished yet — don't break the streak, don't count it */
      } else break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return {
    due_to_date: dueToDate.length,
    posted: dueToDate.filter((p) => posted.has(p.id)).length,
    this_week_due: thisWeekDue.length,
    this_week_posted: thisWeekDue.filter((p) => posted.has(p.id)).length,
    streak_days: streak,
  };
}
