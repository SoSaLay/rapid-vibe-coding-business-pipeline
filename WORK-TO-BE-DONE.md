# Work To Be Done — Progress Tracker

> **Purpose:** the living checklist of what's done and what's left. Each session,
> check off `[x]` what got completed, add new tasks, and keep "Where we are now"
> current. This is the human-readable status board (CLAUDE.md is the architecture
> doc for the AI agent; the `~/.claude` memory files are the running log).

**Where we are now: ALL 11 PHASES BUILT.** Phase 11 Iteration closes the loop: voice/text check-in
(7 core PO questions + app-specific ones, auto-pulled pipeline signals) → honest traction read +
ranked next moves → owner's decision gate (start next cycle → PO re-opens with the data as the new
raw input, spec v2; keep collecting; or cancel & archive — flag-only, reversible, learnings saved).
Cycle counter + Active/Archived dashboard split. The business is never finished until the owner says
so. Remaining work is **live-testing the whole machine**: Supabase project (Phase 4), full live run
(capture → spec → … → deploy → ops → iterate, Phases 6→11), plus the cross-cutting features and the
deferred cycle-2 engineering append. Next session: start the live run.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

## Pipeline phases

### Phase 1 — Business Owner (capture) ✅
- [x] Voice capture (free Web Speech API, continuous dictation)
- [x] Text capture
- [x] Pull-from-tool intake (generic connector layer)
- [x] Notion connector fully wired (token + pick page/database)
- [x] ClickUp / Jira / Asana / Linear / Trello registered as `coming_soon` stubs
- [x] Emits `raw-idea` artifact; completes phase → unlocks Product Owner
- [ ] Live test Notion pull with a real token
- [ ] (Later) Implement a second real connector (e.g. ClickUp)

### Phase 2 — Product Owner (spec) ✅
- [x] Pushback dialogue — clarifying question rounds (Claude)
- [x] Synthesis → structured `product-spec`
- [x] pm-skills framework auto-selection per idea + override ("Adjust")
- [x] Workspace UI (dialogue thread + spec view)
- [ ] Live test with Anthropic key (dialogue + spec quality)
- [x] **Dialogue tightened (2026-08-17)** — the loop had no round cap (the model decided when it was
  "ready"), which with a ruthless-interrogation prompt meant ~4-6 rounds of 3-6 questions. Now:
  `PO_MAX_ROUNDS = 2` + `PO_MAX_QUESTIONS_PER_ROUND = 4`, **enforced in `generatePOTurn`, not the
  prompt**; once the budget is spent it returns ready WITHOUT a model call (the owner's last answer
  goes straight to the spec button). Turn generation dropped `high` → `medium` effort (triage, not
  synthesis; synthesis stays `high`). Prompt rewritten to "default to DECIDING, not asking" — rank
  candidates by how much the spec would change, infer the rest. Questions are now individually
  skippable in the UI (one unanswerable question used to block the whole round); blanks are sent as
  an explicit skip so the PO decides them rather than assuming.
  Measured A/B on one idea, real model: **10 questions / 59s → 6 questions / 33s**, final round
  15s → 0.01s. Verified live: round 1 = 4 questions, 3 of 4 skipped still produced a full spec with
  every gap in `open_questions` alongside a concrete recommended default.
  To tune, change the two constants at the top of `lib/phases/product-owner.ts`.

### Phase 3 — Market Researcher ✅  *(optional / skippable)*
- [x] Merged old Idea Validation + Market Researcher into one phase
- [x] Exa client + in-app key; forum demand search (idea-aware domains)
- [x] Market/competitor search pass (open web)
- [x] Synthesis → `market-report` with verdict (build/refine/reject/archive)
- [x] Market sections: competitive landscape, sizing, segments, positioning, pricing
- [x] pm-market-research playbooks vendored + used
- [x] Optional + skippable, with "skip for fun / recommended if monetizing" nudge
- [x] Verdict gates the pipeline (build → advance; reject/archive → stop)
- [ ] Live test with Exa + Anthropic keys
- [ ] (Later) Optional Reddit via official Reddit API (Exa can't search Reddit)

### Phase 4 — Pre-Marketing ✅  *(optional / skippable)*
Validation stage 2: landing page + waitlist + pre-sell offer to prove real intent.
- [x] Tools: **marketing-skills** (Corey Haines, MIT) for copy/plan; **Launch UI**-style landing page; **Supabase** waitlist store
- [x] Vendored 11 marketing-skills playbooks; generalized framework loader to scan multiple `vendor/` sources (31 frameworks)
- [x] **Stage 1** — validation-kit generation (positioning, pre-sell offer, qualifying Qs, social proof from Phase-3 quotes, distribution plan + templates, thresholds); auto-selects marketing playbooks; generic skip route
- [x] **Stage 2** — landing-page generator: self-contained deployable HTML (Launch UI dark aesthetic, Tailwind CDN), waitlist form wired to Supabase (anon key only — service key never leaked); preview + download routes
- [x] **Stage 3** — Supabase store (`lib/supabase.ts` + one-time SQL), waitlist dashboard (signups + pre-sale vs thresholds), evaluate → `audience-brief` verdict (proceed/pivot/stop/keep-collecting) gating the phase
- [x] **Content library** — per-platform evergreen content direction (X/Twitter, LinkedIn, Instagram, short-form video, long-form, forums); strategy, themes, hook starters, CTA direction, posting cadence; collapsible accordion UI in the kit view
- [x] **Creative direction picker** (`lib/brand-direction.ts`): "show me the thinking first" — proposes 3 distinct text directions (vibe/color/logo/UI feel), nothing generated until the founder picks one; the choice is stored project-wide (`settings.brandDirection`) and seeds every asset + UI prompt (forward-flow: Pre-Marketing → Product Design → Marketing)
- [x] **Brand assets (Nano Banana)** (`lib/brand-assets.ts` + `pre-marketing/assets` route): auto-seed logo + hero + OG from the positioning, embedded inline into the landing page; carried forward and locked in Product Design
- [x] **Pipeline-wide model selector** (`components/EngineSelector.tsx` + `settings` route): Google (default) / Claude for UI generation; images stay Google-only (noted in UI)
- [x] **Animated landing page**: always-on lightweight motion (CSS aurora, IntersectionObserver scroll-reveal, hover lifts), `prefers-reduced-motion`-aware, + an opt-in Three.js/WebGL shader hero (`three@0.158.0`, explicit-context init w/ graceful CSS fallback). Verified in browser (WebGL paints, reveals fire, reduced-motion guarded)
- [x] Verified: typecheck clean, HTML render validated (security check passed), all gating works

**Live-test dependencies (not yet set up):**
- [x] Anthropic API key — pasted in-app ✅ (user confirmed)
- [ ] **Supabase** — create a free project at supabase.com → grab Project URL + anon key + service_role key → paste in-app under Phase 4 "Connect Supabase". Then run the one-time SQL it shows you in the Supabase SQL Editor.
- [ ] **Notion token** *(optional — only needed for Phase 1 Notion intake)* — Notion integration token + page/database ID, pasted in-app
- [ ] Full end-to-end live run: capture idea → spec → market research → pre-marketing kit

- [ ] (Optional later) Scaffold a full literal Launch-UI React project instead of the self-contained HTML, if pixel-true components are wanted

**Email broadcast hub (Resend) ✅** — fills the gap between Clerk/Stripe transactional+billing email (covered) and GTM email (was unsendable). A **manual broadcast hub** in the orchestrator: waitlist updates, launch announcements, "new feature is out" product notifications, and campaigns are one umbrella the founder composes and sends by hand — NOT automated/event-driven, and NOT wired into the apps the pipeline builds.
- [x] Pluggable service layer `lib/email/` (interface + Resend impl over REST, no SDK + registry; `data/connectors/resend.json`), mirroring `lib/llm`/connectors
- [x] **Project-wide opt-in** (`settings.emailEnabled`) decided at Pre-Marketing, gates every email surface (Pre-Marketing card, Marketing send, Operations link); opt out → pipeline behaves as before
- [x] Onboarding: Resend key row + ℹ️ key-help (incl. domain-verify note; "no Supabase setup needed")
- [x] Pre-Marketing "Email your audience" card: connect Resend → sync Supabase waitlist into a Resend audience → compose → send-test-to-self → broadcast (Broadcasts + Audiences for managed unsubscribe/analytics)
- [x] Marketing: the existing `waitlist_email` gets a gated "Send via Resend" (reuses the same broadcast route)
- [x] Operations: Resend console deep-link in the recurring checklist, gated on `emailEnabled`
- [x] Verified: typecheck clean; opt-in/opt-out gate, settings persistence, and bad-key error path confirmed in browser (demo project)
- [ ] Live test with a real Resend key: send-test, sync, broadcast to a real audience (needs key + optional verified domain)
- [ ] (Later) Sync post-launch app users (not just the waitlist) from Supabase into the audience

### Phase 5 — Product Design ✅  *(optional / skippable)*
Produces the `design-spec` the build phase works from. Two tools vendored:
- [x] Vendored **ui-ux-pro-max** core skill (MIT, 89k★) → `vendor/ui-ux-pro-max/` — the always-on hard-rules layer (a11y, touch targets, typography, layout, named UI styles)
- [x] Vendored **ux-ui-agent-skills** subset (MIT via package.json) → `vendor/ux-ui-agent-skills/` — 138-system reference library (`DESIGN.md` each) + `design-taste.md` anti-slop layer; loaded by `lib/design-systems.ts` (not the SKILL.md loader, by design)
- [x] **Stage 1** — design brief: picks 1–2 reference design systems, then generates branding (name/tagline/personality/voice/logo direction, reuses Phase-4 positioning), UX (screens w/ empty-loading-error-success states + responsive notes, flows, IA), visual tokens (exact hexes, Google fonts, spacing/radius/elevation), component inventory, do's & don'ts, open risks
- [x] **Stage 2** — per-screen self-contained Tailwind-CDN HTML mockups from the Stage-1 tokens (preview/download/regenerate per screen, stored under `data/projects/<id>/mockups/`)
- [x] **Stage 2 is now a pluggable design engine** (`lib/design/engine.ts`): `claude-html` (original) + `google-stitch` (Stitch-mode). Stitch has no public API, so Stitch-mode replicates it via the Gemini 2.5 REST API — Stage-1 brief rendered as a "DESIGN LOCK" + per-screen Stitch prompt (platform→context→emotional goal→elements→states→theme). `activeDesignEngine()` prefers Stitch when Google is connected, else falls back to Claude. Both engines share the same HTML contract (preview/storage/UI unchanged). Each mockup records which engine produced it (`mockupEngines` map → badge in UI)
- [x] **Google AI (Gemini) provider** (`lib/google/genai.ts`, key stored `data/connectors/google-ai.json` or `GOOGLE_AI_API_KEY`/`GEMINI_API_KEY`); configure routes `app/api/google/{route,configure}`; in-app "Unlock Stitch-mode" connect row in `ProductDesign.tsx`. Same key is the planned surface for Nano Banana (images) + Veo (video) later
- [x] API routes (`generate-brief`, `mockups`, `preview`, `approve`) + `ProductDesign.tsx` workspace UI; approve → `design-spec` artifact + phase complete; skippable via generic skip
- [x] Verified: typecheck clean, route guards smoke-tested, loader sees 32 frameworks + 138 design systems; Stitch-mode UI verified in browser (connect row + engine badges + backward-compat with pre-existing mockups)
- [ ] Live test with Anthropic key (brief + mockup quality)
- [ ] Live test Stitch-mode with a real Gemini key (screen HTML quality vs Claude engine)

### Phase 6 — Development & Engineering — Part A ✅ / Part B ⬜
**Part A — the build pipeline.** Tool decision: **GSD** recommended as a one-time global install (`npx get-shit-done-cc`), NOT vendored (24MB, fast-moving canary releases, installs to `~/.claude`) — the workspace briefing is agent-agnostic (`TASKS.md` + `CLAUDE.md`), works with bare Claude Code, and the monitor detects GSD's `.planning/` when present. OpenSpec deferred to Phase 11; boilerplates (open-saas/ixartz) rejected — clean scaffold + briefing beats stripping kitchen-sink code.
- [x] **Architect** (`lib/phases/engineering.ts`): reads product-spec + design-spec (design optional) → stack proposal + rationale + Mermaid diagram + key decisions → `stack-selection`
- [x] **Tech-stack selector** (`lib/stack.ts`, 9 slots; defaults silent, deviations warned, hidden behind "Change tech stack"): Frontend (Next.js + shadcn/ui), Backend (Next.js API routes), Database (Supabase), Auth (Supabase Auth | Clerk), Payments (none | Stripe | Clerk Billing), Hosting (**AWS Amplify** | Vercel), Domain (**Route 53**), Coding agent (Claude Code | others coming_soon), AI model (only if the app itself needs AI)
- [x] **Workspace generator** (`lib/workspace.ts`): `~/Rapid Vibe Coding Apps/<slug>/` (git init + briefing commit) with CLAUDE.md (stack + design tokens + do's/don'ts verbatim + execution discipline + Launch-Guide template), TASKS.md (parseable checkbox tracker), SPECS/*.json. Info notice shown before folder creation. Agent scaffolds the actual app as Milestone 1 (workspace creation stays instant/offline).
- [x] **Task graph**: milestones w/ small tasks + verifiable acceptance criteria; screen tasks must implement design-spec states; test setup early; final milestone = verification + LAUNCH-GUIDE.md → `task-graph`
- [x] **Build monitor**: progress route parses TASKS.md checkboxes + recent commits + GSD detection; UI polls every 20s (phone-friendly). User's only build action: copy-paste one start command.
- [x] **Complete**: gated on all tasks done (or manual force) → reads agent-written LAUNCH-GUIDE.md (LLM fallback) → `build-manifest` gates QA; Launch Guide shown in UI
- [x] Verified: typecheck clean, all route guards smoke-tested
- [ ] Live test: full run (propose → approve → scaffold → real Claude Code build of a small app)

**Part B — idea-type labeling ✅**
Business Owner labels the idea at capture (Phase 1) → label flows through the whole pipeline as context and adapts downstream phases (esp. the Phase 6 stack — though most types still get a simple website/UI built).
- [x] Taxonomy confirmed with user — all 9 (`lib/idea-types.ts`): web app, mobile app, web+mobile, AI agent/agent team, browser extension, API/dev tool, community/paid group, physical product, content/media brand — each with pipeline-wide `implications` text
- [x] Label picker (chip row) in Phase 1 capture UI, applies to both direct + pull intake; stored on `raw-idea` payload + project meta (`idea_type`; legacy projects default to web-app)
- [x] Trickle-down: PO dialogue + spec synthesis get the context (route-level inject); `idea_type` stamped into `product-spec` at synthesis; all downstream `specToText`s (research, pre-marketing, design, engineering) append `ideaTypeContext()` — the architect's stack proposal adapts per type (e.g. mobile → Expo deviation, AI agent → AI-model slot required, community → light task graph)
- [x] Verified: typecheck clean; live capture smoke test confirmed label on meta + artifact

### Phase 7 — QA ✅
Plan → automated run → manual pass → sign-off (QA lifecycle collapsed for solo founder + AI agent).
Tool decision: **zero external dependencies** — 8 tools evaluated (Keploy, vibetest-use, cve-mcp-server,
RedAmon, VUDA, SafeLine, qa-claude-skill, claudskills qa-engineer), none adopted; patterns stolen instead
(vibetest's crawl-and-report idea, Anytype's change-driven plan-first discipline, qa-claude-skill's
lifecycle shape). Security content distilled from OWASP Top 10 2021 + WSTG (verification, not invention —
Phase 6 baked the defaults in; QA checks they survived).
- [x] **QA plan generator** (`lib/phases/qa.ts`): reads product-spec + design-spec + build-manifest →
  automated test cases (every flow + every screen's 4 states), stack-aware OWASP security checklist
  (only applicable categories), 5-10 item human manual checklist, exit criteria
- [x] **Workspace briefing**: QA-PLAN.md (execution discipline + results contract) + qa/checklist.json;
  agent runs one copy-paste command, may make small `qa-fix:` commits, writes qa/results.json + QA-RESULTS.md
- [x] **Progress monitor**: parses qa/results.json (suite/cases/security/npm-audit), 20s polling like the build monitor
- [x] **Manual checklist UI**: tap pass/fail/n-a + notes per item, phone-friendly, auto-saved per tap
- [x] **Defect loop**: failures (automated + manual) → "Send fixes to builder" appends QA-R<n> fix-round
  milestone to TASKS.md → rebuild → re-run QA
- [x] **Sign-off**: deterministic exit gate (suite green, 0 failed cases/security, 0 critical audit, manual done)
  → `qa-report` with ship / ship-with-warnings verdict (force = sign off anyway, blockers recorded) → gates Deployment
- [x] Verified: typecheck clean, all 5 route guards smoke-tested, deterministic core (parse/exit/renderers) unit-smoked
- [ ] Live test: full QA run against a real built app (depends on the Phase 6 live build)
- [ ] (Shelf) Keploy record/replay regression suites → revisit Phase 10/11 when apps have real traffic;
  vibetest-use → swap-in candidate for the browser smoke-crawl if it matures

### Phase 8 — Deployment ✅
Plan → preflight → one-command agent deploy → verify & sign-off. Native build (no external tools);
hands-off everywhere honestly possible, human to-dos only where machines can't (domains, costs).
- [x] **Deploy-target registry** (`lib/deploy/`): `DeployTarget` interface; **AWS Amplify** active
  (WEB_COMPUTE = Next.js SSR + API routes on Lambda automatically); **Vercel** + **VPS** coming_soon stubs
- [x] **Options at deploy time**: per-app **AWS WAF toggle** (off by default, cost stated — user decides per app),
  optional Route 53 custom domain (free amplifyapp.com URL default)
- [x] **Deploy plan** (`lib/phases/deployment.ts`): LLM slice = env-var inventory (from .env.example + launch
  guide) + human to-dos + app-specific notes; deterministic slice = DEPLOY-PLAN.md runbook (idempotent,
  check-before-create, never prints secrets, tags everything `app=<slug>`)
- [x] **Environments**: git branches → Amplify branches (dev / uat / main=prod), auto-deploy on push
- [x] **Preflight, auto-verified**: AWS CLI, AWS credentials (`sts get-caller-identity`), gh auth, workspace —
  green/red lights with fix instructions (verified live: all green on this machine)
- [x] **Agent deploy run**: one paste command; agent pushes to private GitHub repo, creates Amplify app + branches,
  sets env vars (values from .env.local, never through the dashboard), polls builds, writes deploy/results.json +
  DEPLOY-GUIDE.md; 20s monitor
- [x] **Security carryover from Phase 6, automated**: orchestrator fetches the live URLs itself and verifies
  HTTPS + 5 security headers survived to production; results stored in the manifest
- [x] **Sign-off**: deterministic gate (prod live + reachable + no agent blockers) → `deploy-manifest`
  (URLs, app id, region, WAF/domain status, verification, outstanding to-dos) gates Phase 9; force = recorded warnings
- [x] Verified: typecheck clean, 4 route guards smoke-tested live, deterministic core (runbook/parse/exit) unit-smoked,
  real preflight ran green
- [ ] Live test: full deploy of a real built app (depends on the Phase 6→7 live run)
- [ ] (Decision honored) root-credential detection NOT built — user handles IAM hygiene themselves (root→admin IAM
  user + MFA + budget alarm advice given 2026-06-10)

### Phase 9 — Marketing & Sales ✅  *(optional / skippable)*
Lean by design: 2–3 channels max, organic only (paid ads out of scope), pipeline writes — human posts.
Tools: 7 evaluated → **marketing-skills** +6 playbooks (content-strategy, social, emails, video,
community-marketing, marketing-ideas), **social-media-skills** (Charlie Hills) 6 craft skills vendored
(voice-builder, hook-generator, post-writer, post-scorer, content-matrix, reels-scripting),
**email-campaigns-claude** vendored (launch email), **Marketing-for-Founders** distilled into the
strategy prompt (CC BY-SA, credited). Rejected: univa (own platform, overkill), viral-clips-crew
(author-abandoned), goose-skills (Python/goose-harness architecture mismatch).
- [x] **Campaign plan** (`lib/phases/marketing.ts`): channels (2-3 cap as policy) + pillars + weekly rhythm
  + metrics; brand voice pulled from design-spec branding; builds on Phase-4 content library + positioning
  + Phase-3 research signals
- [x] **Launch checklist, in-depth**: 15-25 items across prep / launch week / momentum-to-sales; names real
  directories/communities + the angle for each; covers the SALES half (pricing sanity, onboarding follow-up,
  testimonials, first-10-customers outreach, reply-to-everything); every item has why + how
- [x] **Waitlist launch email** (email-campaigns playbook) — generated when Phase 4 produced an audience-brief;
  sending stays human (Resend connector = future option)
- [x] **Content batches**: 14 days of paste-ready posts per rhythm slot, dated to the real calendar,
  hook/body/CTA, platform-formatted, pillar-rotated, repetition guard against prior hooks, post-scorer bar
- [x] **Posting loop UI** (phone-first): Today view w/ copy + posted ✓ per post, overdue flagging, upcoming
  preview, streak counter, "Generate next 2 weeks" when the schedule runs low; loop stays live after sign-off
- [x] **Sign-off**: batch exists + launch checklist done (or force w/ recorded blockers) → `campaign-report`
- [x] **Campaign media (Nano Banana + Veo)**: per-post **image** generation (Nano Banana, brand-grounded, reuses the
  logo as a reference) + **auto-seed** of the first few once a batch exists; per-post **video on-demand** (Veo 3.1,
  `veo-3.1-generate-preview`, async start→poll→download, ~$0.10–0.60/clip — shown in the hint) for reel/short formats;
  prompts derived from the post's own script + brand direction (no manual entry). Routes `marketing/image`, `marketing/video`
- [x] **Google Pomelli handoff**: Pomelli has no API (web-only), so a card builds a ready campaign brief from the plan
  (URL + positioning + pillars) + an "Open Pomelli ↗" deep link + copy buttons — paste-and-go
- [x] Verified: typecheck clean, 4 route guards smoke-tested, 45 frameworks load (6 social-media-skills +
  1 email-campaigns), streak/stats logic unit-smoked; Marketing media UI verified in browser (Pomelli card renders, posts
  render, media controls correctly hidden when Google not connected)
- [ ] Live test: full campaign generation for a real deployed app
- [ ] Live test Nano Banana images + Veo video with a real Gemini key (Veo is async + paid — verify the poll/download path)
- [ ] (Future) Resend connector for one-click waitlist email send; auto-posting deliberately rejected
  (API cost/fragility/ban risk — human posting keeps accounts safe and content human)

### Phase 10 — Operations & Maintenance ✅
Design (user's call, option A enhanced): NOT a live dashboard — a **recurring tool-grouped checklist**
tailored to what was actually deployed (stack-selection + deploy-manifest). Each item = one concrete
check inside one tool's console, with a daily/weekly/monthly cadence that **resets on a timer** after
check-off (24h / 7d / 30d), plus a deep link to that console. Stays live after sign-off (like the
Phase 9 posting loop). Live API pulls (CloudWatch/Supabase) deliberately rejected — native dashboards
do it better; pipeline links out instead.
- [x] `lib/phases/operations.ts` — LLM generates tools[] (name/url/role/checks w/ cadence) + release
  process + incident response; real console URLs from manifest ids (Amplify app_id + region); stable
  check ids assigned server-side; writes OPS-GUIDE.md to app workspace
- [x] `lib/ops-cadence.ts` — pure shared cadence math (isDue / resetsIn), client-safe
- [x] API routes: `plan` (generate, resets timers) + `track` (check off / undo, validates item id)
  + `complete` (sign-off w/ checklist stats / skip)
- [x] `components/Operations.tsx` — due-now rollup, tool cards w/ Open ↗ links, tap-to-check with
  optimistic UI + countdown badges, release/incident runbooks, sign-off; checklist keeps running after
- [x] Wired into workspace page + project route (phaseState `operations`)
- [x] Verified: typecheck clean, cadence + stable-id logic unit-smoked (10 cases)
- [ ] Live test: full ops report for a real deployed app (depends on Phase 6→7→8 live run)

### Phase 11 — Iteration ✅
The loop-closer. Check-in → honest synthesis → owner's decision gate. Loop-back target decided:
**Product Owner** (check-in data replaces Phase 1 as the new raw input; PO interrogates it → spec v2).
- [x] **Check-in** (`lib/phases/iteration.ts`): 7 fixed core questions (users, retention, revenue,
  feedback extremes, marketing, time sinks, gut check) + 3-5 LLM questions specific to THIS app;
  answers by **voice or text** (VoiceInput reused per question, new `label` prop); auto-pulled
  signals so the owner never retypes what the pipeline knows (P9 posting streak, P10 checklist
  discipline, P4 audience verdict)
- [x] **Synthesis**: traction read (strong/promising/weak/**too-early** is legit) + 3-5 ranked next
  moves (growth/product/fix, effort-tagged, small-steps-compound bias) + recommended 1-3 focus
- [x] **Decision gate** (always the owner's): next-cycle / keep-collecting / cancel-&-archive
- [x] **Next cycle**: `iteration-brief` artifact (incl. pre-rendered `po_handoff`) → `startNextCycle`
  (cycle++, PO active w/ fresh dialogue, downstream re-locked, artifacts untouched → v2s); PO start
  route injects the handoff when cycle > 1; cycle badge in workspace header + dashboard
- [x] **Archive**: flag-only + reversible (`setArchived`), nothing deleted, learnings + optional note
  recorded in a final brief; UI warns the deployed app stays live on hosting; dashboard splits
  Active/Archived w/ unarchive; `/api/projects/[id]/archive` toggle
- [x] Routes: iteration/{checkin,synthesize,decide} + archive; wired into workspace page + project GET
- [x] Verified: typecheck clean; store cycle/archive/PO-handoff logic smoke-tested end-to-end (12 asserts)
- [ ] Live test: full check-in + synthesis with real data (depends on a deployed app)
- [x] **Cycle-2 engineering (iteration mode)**: when cycle ≥2 reaches Phase 6 with an existing
  workspace — propose route **reuses** the prior stack-selection instantly (no LLM; migrating a live
  app's stack is a rewrite, not an iteration); scaffold route **appends** an `IT<cycle>` milestone to
  the existing TASKS.md (build history + checked boxes + QA fix rounds preserved, ids forced to
  IT<n>.1…, no-scaffold/no-redo rules, regression criteria, final verification task) driven by the
  iteration-brief focus moves + current task history; SPECS/*.json refreshed to latest versions;
  greenfield path untouched. Verified: typecheck clean + append/parse compatibility smoke-tested
  (monitor + completion gate read the merged tracker correctly)

---

## Demo mode (built 2026-06-11)
Validate the whole pipeline on a separate localhost with zero keys:
- [x] `pnpm seed-demo` → writes the **FridgeChef** demo project (hand-written realistic artifacts for
  all 10 phases + phase states, landing on Iteration active) into `data-demo/` (gitignored; real
  `data/` never touched; re-running resets the demo)
- [x] `pnpm demo` → http://localhost:3002 with `DATA_DIR=data-demo` + `MOCK_LLM=1`
- [x] **Mock LLM provider** (`lib/llm/mock.ts`) behind the same `LlmProvider` interface — masquerades
  as the configured provider so every "Generate" button works: canned outputs on the demo path (PO
  turn/spec, iteration questions/brief, IT task graph, stack proposal) + generic schema-filler
  fallback for every other phase (nothing can crash)
- [x] `DATA_DIR` env override in `lib/store.ts`; `MOCK_LLM` switch in `lib/llm/registry.ts`
- [x] Verified live end-to-end on :3002: project renders all phases → check-in (11 Qs + 3 auto-pulled
  signals) → brief (promising, 4 moves) → next cycle (cycle 2, PO active, downstream re-locked) →
  PO reopens with mock pushback; demo then re-seeded to pristine
- Demo limits: Exa re-run in Phase 3 still needs a real key (phase is seeded complete); walking
  cycle 2 all the way to Engineering creates a real (mock-briefing) workspace folder under
  `~/Rapid Vibe Coding Apps/`

## Cross-cutting features (not tied to one phase)

### PostHog analytics (product analytics for what the pipeline SHIPS — never the orchestrator)
Rollout is deliberately staged: instrument the earliest thing that reaches real people (the Phase-4
landing page), then push the same connection outward through the phases that follow.
- [x] **Connector** (`lib/posthog.ts` + `/api/posthog` + `/api/posthog/configure` + Onboarding row).
  Two keys, two jobs: `projectApiKey` (phc_…, public, write-only, safe in the browser) and an
  OPTIONAL `personalApiKey` (phx_…, private, server-side) that unlocks READING stats back. Host is
  prefilled to US cloud; `assetHostFor`/`apiHostFor` derive the CDN + REST origins (self-hosted
  collapses to one). Project key is verified against the remote-config endpoint (read-only, emits no
  event); an unknown token 404s there and the error names region mismatch as the likely cause.
- [x] **Phase 4 landing page** (`lib/phases/landing-page.ts`) — async loader injected into `<head>`,
  `person_profiles: 'identified_only'`, plus a real funnel: `waitlist_started` (first focus) →
  `waitlist_submitted` (+ `identify` on the email) → `waitlist_failed`. **Localhost/file: guard** so
  the founder's own in-app previews never land in the funnel as visitors. No key connected = page
  renders exactly as before (verified). Existing pages need a regenerate (or a deploy, which
  re-renders anyway) to pick up the snippet.
- [ ] **Phase 6 stack** — add an `analytics` slot to `STACK_SLOTS` (default posthog) so the briefing
  ships built apps instrumented from task 1
- [ ] **Phase 8 deploy** — `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` in the env-var inventory (falls out of
  the Phase 6 slot)
- [ ] **Phase 10 ops** — PostHog tool card w/ console URL + recurring checks (funnel drop-off, errors)
- [ ] **Phase 11 iteration** — query real numbers into `PulledSignal[]`; today the founder is asked to
  TYPE users/retention/revenue from memory. Needs the personal API key. Highest-value remaining step.
- [ ] Live test with a real PostHog key: connect → regenerate landing → deploy → confirm events land

### Other
- [x] `git init` + first commit + **pushed to GitHub** — private repo `SoSaLay/rapid-vibe-coding-pipeline`, branch `main`. README + MIT LICENSE + `.env.example` + tight `.gitignore`. Remote verified clean (no `data/`, no secrets). Flip to public when ready to open-source.
- [ ] Per-app **project dashboard**: aggregated tools + management URLs
- [ ] **Tech-stack table** per app (inferred from the code)
- [ ] **Open-Source Tool Directory**: pull repo → Dockerize → host → control panel (status/ports/logs)
- [ ] Cross-app **analytics/monitoring** view (critical errors surfaced)
- [ ] **Mobile remote access** (Tailscale) so the pipeline is drivable from the phone anywhere
- [ ] AWS account/IAM setup made repeatable for every app built

## Known notes / decisions
- Exa **cannot** search Reddit (crawler wall since 2024) → forums-in-general instead.
- Only the **Exa key** has been entered live so far; Anthropic + Notion keys still needed to run Phases 1–3 fully.
- Orchestrator stack = Next.js 14 + Tailwind v3 (could move to v4 later — minor).
- Default stack the pipeline recommends for **built apps**: Next.js + AWS Amplify + Lambda + Supabase + Clerk.
