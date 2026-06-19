/**
 * Seed the demo project — "FridgeChef" — a complete fake business that has
 * already been captured, specced, researched, designed, built, QA'd, deployed,
 * marketed, and is running ops. The pipeline lands on Phase 11 (Iteration)
 * ready to check in, synthesize, and loop — all on mock data, no keys.
 *
 * Run via:  pnpm seed-demo      (writes to data-demo/, never touches data/)
 * Then:     pnpm demo           (localhost:3001, MOCK_LLM=1)
 *
 * Re-running the seed wipes and rewrites the demo project (fixed id).
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "data-demo";
const PROJECT_ID = "demo-fridgechef";
const ROOT = path.join(process.cwd(), DATA_DIR, "projects", PROJECT_ID);
const NOW = new Date();
const daysAgo = (n: number, h = 12) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

/* ------------------------------------------------------------------ */
/*  Writers                                                            */
/* ------------------------------------------------------------------ */

async function artifact(phase: string, type: string, createdDaysAgo: number, payload: unknown, inputs: string[] = []) {
  const envelope = {
    project_id: PROJECT_ID,
    phase,
    artifact_type: type,
    version: 1,
    status: "complete",
    created_at: daysAgo(createdDaysAgo),
    inputs,
    payload,
  };
  await fs.writeFile(path.join(ROOT, "artifacts", `${type}.v1.json`), JSON.stringify(envelope, null, 2), "utf8");
}

async function phaseState(phaseId: string, state: unknown) {
  await fs.writeFile(path.join(ROOT, "phase-state", `${phaseId}.json`), JSON.stringify(state, null, 2), "utf8");
}

/* ------------------------------------------------------------------ */
/*  Seed                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  await fs.rm(ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(ROOT, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "phase-state"), { recursive: true });

  /* ---- meta: phases 1-10 complete, iteration active ---- */
  await fs.writeFile(
    path.join(ROOT, "meta.json"),
    JSON.stringify(
      {
        id: PROJECT_ID,
        title: "FridgeChef",
        idea_type: "web-app",
        created_at: daysAgo(45),
        updated_at: daysAgo(0),
        current_phase: "iteration",
        cycle: 1,
        phase_status: {
          "business-owner": "complete",
          "product-owner": "complete",
          "idea-validation": "complete",
          "pre-marketing": "complete",
          "product-design": "complete",
          engineering: "complete",
          qa: "complete",
          deployment: "complete",
          "marketing-sales": "complete",
          operations: "complete",
          iteration: "active",
        },
      },
      null,
      2
    ),
    "utf8"
  );

  /* ---- Phase 1: raw idea (voice) ---- */
  await artifact("business-owner", "raw-idea", 45, {
    source: "direct",
    input_method: "voice",
    title: "FridgeChef",
    idea_type: "web-app",
    raw_text:
      "Okay so hear me out — every single night I open the fridge and there's like, food in there, but I have no idea what to make with it. And all the recipe apps are like 'go buy 14 ingredients' — no! I want an app where I just say what's IN my fridge right now and it tells me what I can cook for dinner tonight. Like three options, real ones, with what I actually have. My sister does this thing where she just orders takeout because deciding is too hard and then half her groceries go in the trash. That's the thing — it's not even about recipes, it's about deciding fast at 6pm with what you've got. FridgeChef. Something like that.",
  });

  /* ---- Phase 2: PO dialogue + spec ---- */
  await phaseState("product-owner", {
    turns: [
      {
        role: "po",
        assessment:
          "There's a real customer moment here — the 6pm decision panic — but the scope could balloon. Need to pin the pain depth and the v1 boundary.",
        questions: [
          {
            id: "q0_0",
            question: "Walk me through the last time YOU hit this problem — what did you actually do?",
            rationale: "Tests whether the pain is observed or imagined.",
          },
          {
            id: "q0_1",
            question: "Is this about cooking inspiration, or about deciding fast? Those are different products.",
            rationale: "The minimum lovable version depends on which job is primary.",
          },
          {
            id: "q0_2",
            question: "Would your sister pay for this, or just use it free until takeout wins again?",
            rationale: "Monetization signal from the very first real user.",
          },
        ],
      },
      {
        role: "owner",
        text: "Last Tuesday — stood there 10 minutes, gave up, made plain pasta AGAIN while chicken expired in the drawer. It's deciding fast, 100%. Inspiration is Pinterest's job. And my sister said she'd pay 'like a coffee a month' if it actually killed the 6pm argument with her husband.",
      },
      {
        role: "po",
        assessment:
          "That's enough — the job is fast deciding with what's on hand, the anchor user is a weeknight household cook, and there's a price utterance on record. Ready to spec.",
        questions: [],
      },
    ],
    ready: true,
    round: 2,
    frameworks: {
      ids: ["problem-framing", "mvp-scoping", "pre-mortem"],
      rationale: "Pressure-tests the pain depth and keeps v1 to the deciding job.",
    },
  });
  await artifact(
    "product-owner",
    "product-spec",
    43,
    {
      summary:
        "FridgeChef turns what's already in your fridge into tonight's dinner decision — three realistic options in under a minute, no shopping required.",
      problem_statement:
        "Weeknight home cooks open a full fridge at 6pm and still can't decide what to make. Recipe apps assume you'll shop for missing ingredients; the actual pain is deciding FAST with what's on hand — so people default to takeout or repeat meals while groceries expire in the drawer.",
      target_users: [
        "Working parents cooking weeknight dinners with zero planning time",
        "Budget-conscious cooks frustrated by wasted groceries",
      ],
      value_proposition:
        "Tell FridgeChef what's in the fridge; it gives you three dinners you can actually cook right now. Deciding takes a minute, leftovers become meals, and the 6pm argument dies.",
      goals: [
        "Fridge-to-decision in under 60 seconds",
        "Users visibly waste less food within a month",
        "Own the 6pm moment before takeout apps do",
      ],
      non_goals: ["Week-ahead meal planning", "Grocery delivery", "Nutrition tracking in v1"],
      must_have_features: [
        { name: "Quick ingredient entry", description: "Type or speak the fridge contents; pantry staples assumed by default." },
        { name: "Three realistic suggestions", description: "Ranked dinners using only what's on hand, honest time estimates, clearly labeled 'uses your expiring chicken'." },
        { name: "Step-through cook mode", description: "One step at a time, big text, greasy-thumb friendly." },
      ],
      nice_to_have_features: [
        { name: "Leftover tracker", description: "Remembers what was cooked; nudges before ingredients expire." },
        { name: "Household sharing", description: "Partner updates the fridge list from their own phone." },
      ],
      success_metrics: [
        "≥60% of completed sessions end with a recipe picked — the customer actually decided dinner",
        "Week-2 retention ≥30% — the 6pm panic recurs, so they should too",
        "Active users self-report less food waste by week 4",
      ],
      key_risks: [
        "Suggestion quality with sparse ingredient lists may underwhelm",
        "The 6pm moment is muscle-memory territory owned by takeout apps",
      ],
      open_questions: ["Photo-based fridge scanning — v2 or never?", "Household plan price point"],
      monetization: "Free tier: 3 suggestions/day. Household plan $4/mo (sharing + leftover tracker) once the weeknight habit is proven.",
      recommendation:
        "Build it lean. Entry + three good suggestions IS the product; everything else waits for retention proof. The customer outcome that matters: dinner decided, food used, argument avoided.",
      idea_type: "web-app",
      frameworks_applied: ["problem-framing", "mvp-scoping", "pre-mortem"],
    },
    ["raw-idea@1"]
  );

  /* ---- Phase 3: market report ---- */
  await artifact(
    "idea-validation",
    "market-report",
    40,
    {
      verdict: "build",
      confidence: "medium-high",
      demand_signal: 7,
      summary:
        "Strong organic complaint volume around 'what do I make with what I have' across cooking forums; existing ingredient-search tools solve discovery, not the 6pm decision. Demand is real, differentiation is the speed-of-deciding framing.",
      themes: [
        { theme: "Decision fatigue at dinnertime", detail: "Recurring posts describe staring at a full fridge and ordering takeout anyway — the pain is deciding, not cooking skill." },
        { theme: "Food waste guilt", detail: "Threads about expiring produce get high engagement and emotional language ('throwing money in the bin')." },
        { theme: "Ingredient-search frustration", detail: "Users of existing tools complain results assume shopping trips and ignore quantities/realism." },
      ],
      representative_quotes: [
        { quote: "I have a fridge FULL of food and just ordered pizza because I couldn't think of a single meal. What is wrong with me?", source: "Mumsnet — Food forum", url: "https://www.mumsnet.com/talk/food" },
        { quote: "Apps keep telling me recipes that need 6 things I don't have. I want the opposite: start from my fridge.", source: "Quora — Cooking", url: "https://www.quora.com/topic/Cooking" },
        { quote: "We throw away maybe £30 of food a month just because we forget what's in there.", source: "MoneySavingExpert forum", url: "https://forums.moneysavingexpert.com" },
      ],
      sentiment: "Frustrated but motivated — people blame themselves, which means a tool that fixes the moment earns loyalty.",
      pain_intensity: "Recurring daily pain with an emotional kicker (waste guilt + family friction). Not hair-on-fire, but high frequency.",
      market_overview:
        "Recipe apps are saturated; ingredient-first deciding is a wedge. Adjacent winners (Supercook, Samsung Food) validate the space but anchor on recipe discovery, not the 60-second weeknight decision.",
      market_size: "UK+US home-cooking app users ~80M; the weeknight-decider niche conservatively 5-10M households. A $4/mo wedge product needs only thousands to matter at this stage.",
      competitive_landscape: [
        { name: "Supercook", positioning: "Ingredient-based recipe search", strengths: "Huge recipe index, free", gaps: "Discovery-oriented; overwhelming results; no decide-fast flow" },
        { name: "Samsung Food (Whisk)", positioning: "Meal planning ecosystem", strengths: "Polish, integrations", gaps: "Planning-first; assumes shopping; heavy onboarding" },
        { name: "Plain ChatGPT", positioning: "Ask the chatbot", strengths: "Flexible", gaps: "No fridge memory, no household, retyping every time" },
      ],
      target_segments: [
        { segment: "Weeknight working parents", description: "Time-poor, decision-fatigued, cook 4-6 nights a week. The anchor segment." },
        { segment: "Waste-conscious budgeters", description: "Motivated by the £/month wasted; respond to 'uses your expiring chicken' framing." },
      ],
      positioning: "Not a recipe app — a dinner-decider. 'Three dinners from YOUR fridge, in a minute.'",
      pricing_signal: "Forum users mention paying for waste reduction; 'coffee a month' utterances appear organically. $4/mo household plan is plausible post-habit.",
      what_must_be_true: [
        "Suggestions from 5-8 typical ingredients feel realistic, not algorithmic",
        "Entry friction stays under a minute on a phone",
        "The 6pm moment can be captured by a nudge before takeout muscle-memory fires",
      ],
      key_risks: ["Sparse-fridge suggestion quality", "Habit competition with takeout apps"],
      kill_criteria: ["Pick-rate below 30% after entry improvements", "Week-2 retention under 10% for two consecutive cohorts"],
      recommendation: "Build the lean decider. Validate the pick-rate before anything else.",
      sources: [
        { kind: "forum", title: "Mumsnet food threads", url: "https://www.mumsnet.com/talk/food" },
        { kind: "forum", title: "Quora cooking topic", url: "https://www.quora.com/topic/Cooking" },
      ],
    },
    ["product-spec@1"]
  );

  /* ---- Phase 4: pre-marketing kit + audience brief ---- */
  await phaseState("pre-marketing", {
    frameworks: { ids: ["positioning", "landing-page", "waitlist"], rationale: "Landing + waitlist validation for a consumer wedge." },
    kit: {
      positioning: {
        problem_statement: "It's 6pm, the fridge is full, and you still can't decide what's for dinner.",
        headline: "Three dinners from YOUR fridge. In a minute.",
        subheadline: "FridgeChef turns what you already have into tonight's plan — no shopping trip, no 45-minute scroll, no wasted chicken.",
        benefit_bullets: [
          "Decide dinner in under 60 seconds",
          "Use what you have — waste less, spend less",
          "Honest recipes: only what's actually in your kitchen",
        ],
        faq: [
          { q: "Is this another recipe app?", a: "No — it's a decider. You'll see three realistic options from your actual fridge, not ten thousand recipes that need shopping." },
          { q: "What does it cost?", a: "Free for 3 suggestions a day. A household plan comes later." },
        ],
      },
      offer: { type: "waitlist", headline: "Get early access", details: "First 200 households get the household plan free for 3 months.", price_hypothesis: "$4/mo household plan" },
      qualifying_questions: [
        { question: "How many nights a week do you cook at home?", why: "Filters for the weeknight habit segment." },
        { question: "What did you do last time you couldn't decide dinner?", why: "Surfaces the takeout default and pain depth." },
      ],
      social_proof: [
        { quote: "I have a fridge FULL of food and just ordered pizza because I couldn't think of a single meal.", source: "Mumsnet" },
        { quote: "I want the opposite: start from my fridge.", source: "Quora" },
      ],
      distribution_plan: [
        { channel: "Instagram Reels", tactic: "15-second 'fridge → dinner' transformations", template: "POV: it's 6pm and the fridge is judging you…" },
        { channel: "Mumsnet / parenting forums", tactic: "Genuine participation in dinner-decision threads", template: "I built a little tool for exactly this — happy to share early access." },
      ],
      fake_door_tests: [{ feature: "Photo fridge scan", copy: "Snap your fridge, get dinner — coming soon. Want it?" }],
      success_thresholds: {
        landing_conversion: "≥25% of visitors join the waitlist",
        waitlist_target: "150 signups in 3 weeks",
        presale_target: "30 'yes I'd pay' on the qualifying question",
        decision_rule: "Hit 2 of 3 → build. Miss all → re-position before writing code.",
      },
      content_library: [
        {
          platform: "Instagram (Reels)",
          content_type: "Short-form video",
          audience_on_platform: "Home cooks scrolling at the exact moment of dinner indecision",
          strategy: "Show the fridge-to-dinner transformation in real time; the product demo IS the entertainment.",
          themes: ["6pm panic POVs", "Expiring-ingredient rescues", "One-fridge three-dinners challenges"],
          posting_cadence: "4x/week",
          hook_examples: ["POV: the chicken expires TODAY", "Everything in this dinner was already in my fridge"],
          cta_direction: "Link in bio → waitlist",
        },
        {
          platform: "Forums (Mumsnet, MSE)",
          content_type: "Helpful threads",
          audience_on_platform: "Parents and budgeters actively complaining about this exact problem",
          strategy: "Answer genuinely, mention the tool only where it truly fits.",
          themes: ["Food waste money math", "Weeknight systems"],
          posting_cadence: "2-3 genuine replies/week",
          hook_examples: ["We cut about £25/mo of waste with one habit change…"],
          cta_direction: "Soft mention + DM for early access",
        },
      ],
    },
  });
  await artifact(
    "pre-marketing",
    "audience-brief",
    30,
    {
      verdict: "proceed",
      confidence: "high",
      demand_summary: "187 waitlist signups in 19 days (target 150) at 31% landing conversion; 41 said they'd pay for the household plan.",
      segment_insights: [
        "Working parents dominate signups (68%) — the anchor segment is confirmed",
        "Waste-guilt messaging out-converted speed messaging 2:1 in forum referrals",
      ],
      validated_positioning: "Dinner-decider framing works; 'three dinners from YOUR fridge' is the headline that converts.",
      what_to_change: ["Lead with waste-guilt angle in paid-free channels", "Photo-scan fake door got 71% interest — keep on roadmap"],
      recommendation: "Proceed to build. The waitlist is warm — keep posting Reels through the build so launch lands on a live audience.",
      metrics: { signups: 187, presale_interest: 41 },
    },
    ["market-report@1"]
  );

  /* ---- Phase 5: design brief + design-spec ---- */
  const designBrief = {
    branding: {
      name: "FridgeChef",
      name_rationale: "Says exactly what it does; the chef lives in your fridge.",
      tagline: "Dinner, decided.",
      personality: ["warm", "decisive", "a little cheeky"],
      voice: "A confident friend who's already looked in your fridge. Short sentences. Zero food-blog rambling.",
      logo_direction: "Rounded fridge silhouette with a chef's hat; works as a single-color app icon.",
    },
    ux: {
      target_user_summary: "A tired parent, phone in one hand, fridge door in the other. Every tap must earn its place.",
      core_jobs: ["Tell it what I have, fast", "Pick one of three dinners", "Cook it without re-reading"],
      information_architecture: "Three screens deep, never more: Fridge → Suggestions → Cook mode. Settings hangs off Fridge.",
      screens: [
        {
          id: "fridge",
          name: "My Fridge",
          purpose: "Capture what's on hand in seconds",
          primary_action: "Get dinner ideas",
          key_elements: ["Tap-chip common items", "Voice entry", "Staples toggle", "Expiring-soon flags"],
          states: { empty: "Friendly prompt: 'What's in the fridge tonight?' with chips ready", loading: "Chips shimmer", error: "Entry saved locally, retry banner", success: "Ingredient list with expiry badges" },
          responsive_notes: "Thumb-zone chips; entry field pinned above keyboard",
          is_key_screen: true,
        },
        {
          id: "suggestions",
          name: "Tonight's Three",
          purpose: "Present three realistic dinners, ranked",
          primary_action: "Pick one → cook mode",
          key_elements: ["Three cards max", "Time + 'uses your expiring X' badges", "Shuffle once"],
          states: { empty: "Needs ≥3 ingredients: nudge back to Fridge", loading: "Three skeleton cards with playful copy", error: "Retry with cached last suggestions", success: "Three ranked cards" },
          responsive_notes: "Cards stack full-width on phones",
          is_key_screen: true,
        },
        {
          id: "cook",
          name: "Cook Mode",
          purpose: "Step-through cooking, kitchen-proof",
          primary_action: "Next step",
          key_elements: ["One step per screen", "XL text", "Keep-awake", "Timer chips"],
          states: { empty: "n/a — always entered with a recipe", loading: "Instant from local data", error: "Steps cached offline", success: "Done screen + 'log leftovers?' nudge" },
          responsive_notes: "Landscape supported for counter propping",
          is_key_screen: false,
        },
      ],
      flows: [{ name: "6pm decision", steps: ["Open app (fridge remembered)", "Adjust chips 10s", "Get ideas", "Pick card", "Cook"] }],
    },
    visual: {
      mood: "Warm kitchen at golden hour",
      mode: "light",
      style: "Soft-rounded cards, generous whitespace",
      colors: [
        { name: "Butter", hex: "#FFC94D", usage: "Primary actions, highlights" },
        { name: "Herb", hex: "#3E7C4F", usage: "Success, fresh badges" },
        { name: "Charcoal", hex: "#22271F", usage: "Text" },
        { name: "Cream", hex: "#FFF9EF", usage: "Backgrounds" },
        { name: "Tomato", hex: "#E5484D", usage: "Expiring warnings, errors" },
      ],
      typography: { heading_font: "Fraunces", body_font: "Inter", type_scale: "1.25 ratio, 18px base (kitchen-readable)" },
      spacing_and_shape: { spacing_scale: "4/8/16/24/40", radius: "16px cards, 999px chips", elevation: "Soft single shadow, no borders" },
    },
    components: [
      { name: "IngredientChip", description: "Tappable pill with expiry tint", used_on: ["fridge"] },
      { name: "DinnerCard", description: "Suggestion card: photo placeholder, time, badges", used_on: ["suggestions"] },
      { name: "StepView", description: "XL single-step display with timer chips", used_on: ["cook"] },
    ],
    dos_and_donts: {
      dos: ["Keep every screen one-thumb operable", "Always show WHY a dinner was suggested ('uses your spinach')", "Write copy like a decisive friend"],
      donts: ["No food photography clichés", "No more than three suggestions ever", "Never require an account before the first suggestion"],
    },
    open_risks: ["Chip taxonomy for international staples", "Cook-mode keep-awake battery cost"],
  };
  await phaseState("product-design", {
    brief: designBrief,
    direction: { system_ids: ["warm-organic", "friendly-rounded"], rationale: "Warm, food-adjacent systems matching the decisive-friend voice." },
    mockups: { fridge: "mocked", suggestions: "mocked" },
  });
  await artifact(
    "product-design",
    "design-spec",
    27,
    { ...designBrief, design_direction: { system_ids: ["warm-organic", "friendly-rounded"], rationale: "Warm, food-adjacent systems matching the decisive-friend voice." }, mockup_screens: ["fridge", "suggestions"] },
    ["product-spec@1", "market-report@1"]
  );

  /* ---- Phase 6: stack + task graph + build manifest ---- */
  const stackChoices = [
    { slot: "frontend", choice: "nextjs", rationale: "Studio default." },
    { slot: "backend", choice: "nextjs-api", rationale: "Studio default." },
    { slot: "database", choice: "supabase", rationale: "Studio default." },
    { slot: "auth", choice: "supabase-auth", rationale: "Studio default." },
    { slot: "payments", choice: "none", rationale: "No payments until the habit is proven." },
    { slot: "hosting", choice: "amplify", rationale: "Studio default." },
    { slot: "domain", choice: "route53", rationale: "Studio default." },
    { slot: "agent", choice: "claude-code", rationale: "Studio default." },
    { slot: "ai-model", choice: "none", rationale: "Suggestion ranking is deterministic in v1 — no LLM dependency at runtime." },
  ];
  const proposal = {
    choices: stackChoices,
    architecture_summary:
      "Next.js app on AWS Amplify with API routes on Lambda; Supabase holds households, fridge contents, and the recipe index. Suggestion ranking runs server-side. Plain studio defaults — nothing about a dinner-decider justifies exotic infrastructure.",
    mermaid_diagram:
      "graph TD\n  U[Tired parent] --> FE[Next.js frontend]\n  FE --> API[API routes on Lambda]\n  API --> DB[(Supabase: fridge + recipes)]\n  API --> AUTH[Supabase Auth]\n  API --> RANK[Suggestion ranker]",
    key_decisions: [
      "Recipe index seeded from a curated 500-recipe set, not scraped",
      "Fridge state per household, not per user, from day one",
      "Ranker is deterministic scoring (match %, expiry urgency, time-of-day) — explainable and free",
    ],
  };
  await phaseState("engineering", {
    proposal,
    stack: stackChoices,
    workspace: { path: "~/Rapid Vibe Coding Apps/fridgechef", startCommand: 'cd "~/Rapid Vibe Coding Apps/fridgechef" && claude', gitInitialized: true },
  });
  await artifact("engineering", "stack-selection", 25, proposal, ["product-spec@1", "design-spec@1"]);
  await artifact(
    "engineering",
    "task-graph",
    25,
    {
      workspace_path: "~/Rapid Vibe Coding Apps/fridgechef",
      milestones: [
        { id: "M1", name: "Scaffold", goal: "App boots with design tokens wired", tasks: [
          { id: "T1.1", title: "create-next-app + Tailwind + tokens", details: "Scaffold with the Butter/Herb/Cream palette as CSS vars", acceptance_criteria: ["pnpm dev serves the shell", "tokens in tailwind.config"] },
          { id: "T1.2", title: "Supabase client + schema + RLS", details: "households, fridge_items, recipes tables", acceptance_criteria: ["RLS on all three tables", "typecheck passes"] },
        ]},
        { id: "M2", name: "The decider", goal: "Fridge → three suggestions works end to end", tasks: [
          { id: "T2.1", title: "My Fridge screen with chips + states", details: "All four design states", acceptance_criteria: ["empty/loading/error/success render", "entry <60s by tap"] },
          { id: "T2.2", title: "Suggestion ranker + Tonight's Three", details: "Deterministic scoring; expiry badges", acceptance_criteria: ["3 cards from 5 seeded ingredients", "'uses your X' badge correct"] },
          { id: "T2.3", title: "Cook mode", details: "Step-through, keep-awake, timers", acceptance_criteria: ["steps advance", "screen stays awake"] },
        ]},
        { id: "M3", name: "Verification + launch guide", goal: "Everything green, guide written", tasks: [
          { id: "T3.1", title: "Verification pass", details: "typecheck, tests, build, audit", acceptance_criteria: ["all green", "LAUNCH-GUIDE.md written"] },
        ]},
      ],
    },
    ["product-spec@1", "design-spec@1"]
  );
  await artifact(
    "engineering",
    "build-manifest",
    20,
    {
      workspace_path: "~/Rapid Vibe Coding Apps/fridgechef",
      tasks_done: 6,
      tasks_total: 6,
      forced: false,
      launch_guide:
        "# FridgeChef — Launch Guide\n\n## Keys & accounts\n- Supabase project → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon only in client), `SUPABASE_SERVICE_ROLE_KEY` (server only)\n\n## Run locally\n1. `pnpm install`\n2. Copy `.env.example` → `.env.local`, paste keys\n3. `pnpm dev` → http://localhost:3000\n\n## Verify the core flow\n1. Add 5 ingredients by chips → tap **Get dinner ideas**\n2. Three cards appear, one badged with your expiring item\n3. Pick one → cook mode steps through\n\n## API routes\n- `POST /api/fridge` — save household fridge state\n- `GET /api/suggestions` — ranked three for tonight\n\n## When something breaks\nLogs: Amplify console (server), Supabase logs (DB/auth). Check env vars first, then RLS policies, then the ranker seed data.",
    },
    ["task-graph@1"]
  );

  /* ---- Phase 7: QA ---- */
  await phaseState("qa", {
    plan: {
      scope_summary: "Verify the decider flow end to end, all screen states, and that Phase-6 security defaults survived the build.",
      test_cases: [
        { id: "C1", area: "Fridge", title: "Chip entry round-trip", steps: ["Add 5 items via chips", "Reload"], expected: "Fridge state persists per household", kind: "flow" },
        { id: "C2", area: "Suggestions", title: "Three ranked cards", steps: ["With 5 items request ideas"], expected: "Exactly 3 cards, expiry badge correct", kind: "flow" },
        { id: "C3", area: "States", title: "Suggestion empty state", steps: ["Clear fridge", "Request ideas"], expected: "Nudge back to Fridge, no crash", kind: "states" },
      ],
      security_checks: [
        { id: "S1", owasp: "A01 Broken Access Control", title: "RLS isolates households", verify: "User A cannot read household B's fridge_items" },
        { id: "S2", owasp: "A03 Injection", title: "Zod at API boundary", verify: "Malformed fridge payload returns 400, not 500" },
      ],
      manual_checklist: [
        { id: "M1", title: "One-thumb test on a real phone", instructions: "Complete the whole 6pm flow with one thumb", why_human: "Ergonomics can't be automated" },
        { id: "M2", title: "Kitchen-distance legibility", instructions: "Prop phone on counter, read cook mode from arm's length", why_human: "Real-world readability" },
      ],
      exit_criteria: ["Suite green", "No failed security checks", "Manual checklist complete"],
    },
    manual: [
      { id: "M1", status: "pass", note: "Smooth one-thumb" },
      { id: "M2", status: "pass" },
    ],
    fixRound: 1,
  });
  await artifact(
    "qa",
    "qa-report",
    15,
    {
      verdict: "ship",
      forced: false,
      blockers_at_signoff: [],
      scope_summary: "Decider flow, screen states, and security defaults verified.",
      cases: { total: 3, passed: 3, failed: 0, skipped: 0 },
      security: { total: 2, passed: 2, failed: 0, na: 0, findings: [] },
      npm_audit: { critical: 0, high: 0, moderate: 2 },
      open_defects: [],
      fix_rounds: 1,
    },
    ["build-manifest@1"]
  );

  /* ---- Phase 8: deployment ---- */
  await phaseState("deployment", {
    plan: {
      summary: "FridgeChef deploys to AWS Amplify (Next.js SSR on Lambda) with dev/uat/prod from git branches; Supabase stays managed.",
      env_vars: [
        { name: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL — Settings → API", required: true, secret: false },
        { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Public anon key — safe in browser", required: true, secret: false },
        { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Server-only admin key — never NEXT_PUBLIC", required: true, secret: true },
      ],
      human_todos: ["Decide on a custom domain (skipped for launch — amplifyapp.com URL is fine)"],
      notes: ["WAF left off at launch — revisit at real traffic"],
    },
    options: { waf: false, domain: null },
    startCommand: 'cd "~/Rapid Vibe Coding Apps/fridgechef" && claude',
  });
  await artifact(
    "deployment",
    "deploy-manifest",
    12,
    {
      target: "amplify",
      app_id: "d1demo2fridge",
      region: "us-east-1",
      github_repo: "https://github.com/demo/fridgechef",
      environments: [
        { name: "dev", branch: "dev", url: "https://dev.d1demo2fridge.amplifyapp.com", status: "live" },
        { name: "uat", branch: "uat", url: "https://uat.d1demo2fridge.amplifyapp.com", status: "live" },
        { name: "prod", branch: "main", url: "https://main.d1demo2fridge.amplifyapp.com", status: "live" },
      ],
      verification: [
        { name: "prod", url: "https://main.d1demo2fridge.amplifyapp.com", reachable: true, status: 200, https: true, headers_found: ["strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "content-security-policy"], headers_missing: [] },
      ],
      waf: { requested: false, enabled: false, notes: "Off at launch by choice" },
      domain: { requested: null, status: "skipped", notes: "amplifyapp.com URL for launch" },
      human_todos: [],
      forced: false,
      blockers_at_signoff: [],
    },
    ["build-manifest@1", "qa-report@1"]
  );

  /* ---- Phase 9: marketing ---- */
  const posts = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - 10 + i);
    const channels = ["Instagram Reels", "Instagram Reels", "Forums", "Instagram Reels"];
    const pillars = ["6pm panic", "Waste rescue", "Behind the build", "6pm panic"];
    return {
      id: `post_${i + 1}`,
      date: d.toISOString().slice(0, 10),
      channel: channels[i % 4],
      pillar: pillars[i % 4],
      format: i % 4 === 2 ? "forum reply" : "reel",
      hook: ["POV: the chicken expires TODAY", "Everything in this dinner was already in my fridge", "We cut £25/mo of food waste with one habit", "It's 6pm and the fridge is judging you"][i % 4],
      body: "[demo] 15-second fridge-to-dinner transformation: open fridge, tap five chips, show the three suggestions, cook the winner. Real kitchen, real mess, no styling.",
      cta: "Link in bio — decide dinner in a minute",
    };
  });
  await phaseState("marketing-sales", {
    plan: {
      strategy_summary: "Own the 6pm moment on the two channels where it already lives: Instagram Reels (the panic is scrollable) and the forums where the complaints were found. Organic only; the product demo is the content.",
      channels: [
        { name: "Instagram Reels", why_this_channel: "The 6pm fridge moment is inherently visual and 15 seconds long", audience_mindset: "Scrolling while avoiding deciding dinner", content_types: ["POV reels", "transformation demos"], cadence: "4x/week" },
        { name: "Forums (Mumsnet, MSE)", why_this_channel: "Phase-3 research found the complaints verbatim here", audience_mindset: "Actively asking for exactly this", content_types: ["genuine replies", "waste-math threads"], cadence: "2-3/week" },
      ],
      content_pillars: [
        { name: "6pm panic", description: "POV content about the decision moment", example_angles: ["fridge judging you", "the pasta-again shame"] },
        { name: "Waste rescue", description: "Expiring ingredient saves + money math", example_angles: ["£30/mo in the bin", "chicken rescue missions"] },
        { name: "Behind the build", description: "Founder voice, honest numbers", example_angles: ["pick-rate this week", "what flopped"] },
      ],
      weekly_rhythm: [
        { day: "Mon", channel: "Instagram Reels", format: "reel" },
        { day: "Tue", channel: "Forums", format: "reply" },
        { day: "Wed", channel: "Instagram Reels", format: "reel" },
        { day: "Fri", channel: "Instagram Reels", format: "reel" },
        { day: "Sat", channel: "Instagram Reels", format: "reel" },
      ],
      launch_checklist: [
        { id: "lc1", stage: "prep", title: "Warm the waitlist with a launch-date email", why: "187 people asked to be told", how: "Use the waitlist email below; send 3 days before" },
        { id: "lc2", stage: "launch_week", title: "Reply to every single comment for 7 days", why: "Early engagement compounds the algorithm", how: "20 min morning + evening" },
        { id: "lc3", stage: "momentum", title: "Ask the first 10 streak users for a testimonial", why: "Social proof from the anchor segment", how: "Personal DM, not a form" },
      ],
      waitlist_email: { subject: "FridgeChef is live — your fridge is about to get useful", preview_text: "Three dinners from what you already have.", body_markdown: "Hi —\n\nYou asked to know when FridgeChef went live. It's live.\n\n**Open your fridge, tap what's in it, get three real dinners.** That's the whole product.\n\nAs promised: you're in the first 200, so the household plan is free for your first 3 months.\n\n→ https://main.d1demo2fridge.amplifyapp.com\n\n— the FridgeChef kitchen" },
      metrics_to_watch: ["Pick-rate (suggestions → chosen)", "Waitlist activation %", "Reel saves (stronger than likes for this niche)"],
    },
    posts,
    postedIds: posts.slice(0, 9).map((p) => p.id),
    checklistDone: ["lc1", "lc2"],
  });
  await artifact(
    "marketing-sales",
    "campaign-report",
    8,
    {
      strategy_summary: "Two-channel organic launch: Reels for the 6pm moment, forums for the pre-validated complaints.",
      channels: [
        { name: "Instagram Reels", why_this_channel: "The 6pm moment is visual", audience_mindset: "Avoiding deciding dinner", content_types: ["POV reels"], cadence: "4x/week" },
        { name: "Forums", why_this_channel: "Complaints live here verbatim", audience_mindset: "Asking for this", content_types: ["replies"], cadence: "2-3/week" },
      ],
      content_pillars: [
        { name: "6pm panic", description: "The decision moment", example_angles: ["fridge judging you"] },
        { name: "Waste rescue", description: "Money + guilt", example_angles: ["£30/mo in the bin"] },
      ],
      weekly_rhythm: [{ day: "Mon", channel: "Instagram Reels", format: "reel" }],
      launch_checklist: [
        { id: "lc1", stage: "prep", title: "Warm the waitlist", why: "187 asked", how: "Email 3 days prior", done: true },
        { id: "lc2", stage: "launch_week", title: "Reply to everything", why: "Algorithm compounding", how: "20 min 2x/day", done: true },
        { id: "lc3", stage: "momentum", title: "First-10 testimonials", why: "Anchor-segment proof", how: "Personal DMs", done: false },
      ],
      waitlist_email: { subject: "FridgeChef is live — your fridge is about to get useful", preview_text: "Three dinners from what you already have.", body_markdown: "(sent at launch — see plan)" },
      metrics_to_watch: ["Pick-rate", "Waitlist activation %", "Reel saves"],
      posting_stats_at_signoff: { posted: 9, due_to_date: 9, streak_days: 6 },
      forced: false,
      blockers_at_signoff: [],
    },
    ["deploy-manifest@1", "audience-brief@1"]
  );

  /* ---- Phase 10: ops ---- */
  const opsReport = {
    summary:
      "FridgeChef runs on AWS Amplify (Next.js on Lambda) with Supabase for data and auth. For one person, the highest-value habit is the 5-minute daily glance: last build green, error rate flat, and the app itself still decides dinner.",
    tools: [
      {
        name: "Your live app",
        url: "https://main.d1demo2fridge.amplifyapp.com",
        role: "The product customers touch — the only check that catches everything at once.",
        checks: [
          { id: "t0_c0_daily", title: "Click through the 6pm flow like a customer", how: "Open prod, add 3 chips, get suggestions, enter cook mode. Bad = any step errors or takes noticeably longer than yesterday.", cadence: "daily" },
        ],
      },
      {
        name: "AWS Amplify",
        url: "https://us-east-1.console.aws.amazon.com/amplify/apps/d1demo2fridge/overview",
        role: "Hosting + builds — every git push to main deploys prod.",
        checks: [
          { id: "t1_c0_daily", title: "Last build succeeded", how: "Overview → main branch. Bad = red build or 'pending' older than 15 min.", cadence: "daily" },
          { id: "t1_c1_weekly", title: "5xx rate in monitoring tab", how: "Monitoring → 5xx errors. Bad = anything above ~0.5% sustained.", cadence: "weekly" },
        ],
      },
      {
        name: "Supabase",
        url: "https://supabase.com/dashboard",
        role: "Database + auth for households and fridge data.",
        checks: [
          { id: "t2_c0_weekly", title: "Auth failure spike check", how: "Auth → Logs, filter failures. Bad = repeated failures from one IP (credential stuffing).", cadence: "weekly" },
          { id: "t2_c1_weekly", title: "DB size vs. free-tier limit", how: "Settings → Usage. Bad = >80% of the 500MB free tier.", cadence: "weekly" },
          { id: "t2_c2_monthly", title: "Verify a backup restore point exists", how: "Database → Backups. Bad = newest backup older than 7 days.", cadence: "monthly" },
        ],
      },
      {
        name: "GitHub",
        url: "https://github.com/demo/fridgechef",
        role: "Source of truth; Dependabot watches dependencies.",
        checks: [
          { id: "t3_c0_monthly", title: "Dependabot alerts + npm audit", how: "Security tab. Bad = any critical; fix within the week.", cadence: "monthly" },
        ],
      },
      {
        name: "AWS Billing",
        url: "https://console.aws.amazon.com/billing/home",
        role: "Cost guardrail — Amplify is cheap until it isn't.",
        checks: [
          { id: "t4_c0_monthly", title: "Month-to-date spend sanity check", how: "Bills page. Bad = >$15/mo without a traffic spike explaining it.", cadence: "monthly" },
        ],
      },
    ],
    release_process: [
      { step: "Branch from dev, build the change", detail: "Small commits; typecheck before push" },
      { step: "Push to dev branch", detail: "Amplify auto-deploys the dev URL — click the changed flow" },
      { step: "Merge dev → uat, smoke the 6pm flow", detail: "Fridge → three suggestions → cook mode on the UAT URL" },
      { step: "Merge uat → main", detail: "Prod auto-deploys; watch the build go green" },
      { step: "Verify prod like a customer", detail: "One full decider run on the live URL before walking away" },
    ],
    incident_response: [
      { step: "Confirm customer impact", detail: "Open prod and run the core flow — is it actually broken for users?" },
      { step: "Check the obvious two", detail: "Amplify build status, then Supabase status page" },
      { step: "Roll back if a deploy caused it", detail: "Amplify → redeploy the previous green build of main" },
      { step: "Fix forward on dev → uat → main", detail: "Never patch prod directly" },
      { step: "Note it in OPS-GUIDE.md", detail: "One line: what broke, why, what prevents the repeat" },
    ],
  };
  await phaseState("operations", {
    report: opsReport,
    prod_url: "https://main.d1demo2fridge.amplifyapp.com",
    checkLog: {
      t0_c0_daily: daysAgo(0, 9),
      t1_c0_daily: daysAgo(1, 9),
      t1_c1_weekly: daysAgo(3),
      t2_c0_weekly: daysAgo(2),
    },
  });
  await artifact(
    "operations",
    "ops-report",
    5,
    { ...opsReport, prod_url: "https://main.d1demo2fridge.amplifyapp.com", signed_off_at: daysAgo(5), checks_done_at_signoff: 4, checks_total: 8 },
    ["deploy-manifest@1"]
  );

  console.log(`Seeded demo project "${PROJECT_ID}" into ${DATA_DIR}/projects/`);
  console.log(`Run:  pnpm demo   →  http://localhost:3002/project/${PROJECT_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
