# Work To Be Done — Progress Tracker

> **Purpose:** the living checklist of what's done and what's left. Each session,
> check off `[x]` what got completed, add new tasks, and keep "Where we are now"
> current. This is the human-readable status board (CLAUDE.md is the architecture
> doc for the AI agent; the `~/.claude` memory files are the running log).

**Where we are now:** Phases 1–7 built. Phase 7 (QA) is the QA director: LLM QA plan
(automated cases + OWASP-mapped security checks + human manual checklist) written into
the app workspace as QA-PLAN.md + qa/checklist.json, agent runs one command and reports
back via qa/results.json, manual pass is tap-through in the UI, defect fix-rounds append
to TASKS.md, deterministic sign-off gate → `qa-report` (ship / ship-with-warnings) gates
Deployment. Remaining live-test blockers: **Supabase project** (Phase 4 waitlist) and a
**full live build run** (Phases 6→7). Next up: **Phase 8 — Deployment**.

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
- [x] Verified: typecheck clean, HTML render validated (security check passed), all gating works

**Live-test dependencies (not yet set up):**
- [x] Anthropic API key — pasted in-app ✅ (user confirmed)
- [ ] **Supabase** — create a free project at supabase.com → grab Project URL + anon key + service_role key → paste in-app under Phase 4 "Connect Supabase". Then run the one-time SQL it shows you in the Supabase SQL Editor.
- [ ] **Notion token** *(optional — only needed for Phase 1 Notion intake)* — Notion integration token + page/database ID, pasted in-app
- [ ] Full end-to-end live run: capture idea → spec → market research → pre-marketing kit

- [ ] (Optional later) Scaffold a full literal Launch-UI React project instead of the self-contained HTML, if pixel-true components are wanted

### Phase 5 — Product Design ✅  *(optional / skippable)*
Produces the `design-spec` the build phase works from. Two tools vendored:
- [x] Vendored **ui-ux-pro-max** core skill (MIT, 89k★) → `vendor/ui-ux-pro-max/` — the always-on hard-rules layer (a11y, touch targets, typography, layout, named UI styles)
- [x] Vendored **ux-ui-agent-skills** subset (MIT via package.json) → `vendor/ux-ui-agent-skills/` — 138-system reference library (`DESIGN.md` each) + `design-taste.md` anti-slop layer; loaded by `lib/design-systems.ts` (not the SKILL.md loader, by design)
- [x] **Stage 1** — design brief: picks 1–2 reference design systems, then generates branding (name/tagline/personality/voice/logo direction, reuses Phase-4 positioning), UX (screens w/ empty-loading-error-success states + responsive notes, flows, IA), visual tokens (exact hexes, Google fonts, spacing/radius/elevation), component inventory, do's & don'ts, open risks
- [x] **Stage 2** — per-screen self-contained Tailwind-CDN HTML mockups from the Stage-1 tokens (preview/download/regenerate per screen, stored under `data/projects/<id>/mockups/`)
- [x] API routes (`generate-brief`, `mockups`, `preview`, `approve`) + `ProductDesign.tsx` workspace UI; approve → `design-spec` artifact + phase complete; skippable via generic skip
- [x] Verified: typecheck clean, route guards smoke-tested, loader sees 32 frameworks + 138 design systems
- [ ] Live test with Anthropic key (brief + mockup quality)

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

### Phase 8 — Deployment ⬜
- [ ] Dev / UAT / Prod environments; AWS (Amplify/Lambda); IAM roles → `deploy-manifest`
- [ ] **Security carryover from Phase 6** (platform-level slice): verify HTTPS + security headers at the host, host WAF/rate-limit config, production env vars set securely (no secrets in build logs), Route 53 + domain wiring
- [ ] WAF decision (from Phase 7 tool eval): **AWS WAF** is the natural fit on Amplify; SafeLine (21.5k★ self-hosted WAF) only if we ever front apps with our own reverse proxy

### Phase 9 — Marketing & Sales ⬜
- [ ] Campaigns, content, lead gen → `campaign-report`

### Phase 10 — Operations & Maintenance ⬜
- [ ] Release, monitoring, error visibility → `ops-report`
- [ ] **Security carryover from Phase 6** (process slice): surface the auth-failure/5xx logs the apps already emit; MVP incident response = alert the owner when something breaks (cross-app critical-errors view is already a cross-cutting goal)

### Phase 11 — Iteration ⬜
- [ ] Loop learnings back to the Product Owner → `iteration-brief`

---

## Cross-cutting features (not tied to one phase)
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
