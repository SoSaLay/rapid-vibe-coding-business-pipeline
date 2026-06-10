# Work To Be Done — Progress Tracker

> **Purpose:** the living checklist of what's done and what's left. Each session,
> check off `[x]` what got completed, add new tasks, and keep "Where we are now"
> current. This is the human-readable status board (CLAUDE.md is the architecture
> doc for the AI agent; the `~/.claude` memory files are the running log).

**Where we are now:** Phases 1–5 built. Anthropic key is connected. Phase 5 (Product
Design) generates a full design-spec — branding, screens with states, design tokens
grounded in a reference design system, component inventory, do's/don'ts — plus HTML
mockups of key screens. Remaining live-test blocker: **Supabase project** (Phase 4
waitlist only — Phases 1–3 + 5 can run end-to-end now). Next up: **Phase 6 —
Development & Engineering**.

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

### Phase 6 — Development & Engineering ⬜
- [ ] System Design Architect: stack selection UI (Clerk vs Supabase, etc.)
- [ ] Default-stack recommendation + deviation warnings
- [ ] Spec-driven task graph; Claude Code executes tasks across sessions
- [ ] Integrate OpenSpec and/or gsd-core (pick one or compose) → `task-graph`, `build-manifest`

### Phase 7 — QA ⬜
- [ ] Automated tests, **manual testing** checklist, security review → `qa-report`

### Phase 8 — Deployment ⬜
- [ ] Dev / UAT / Prod environments; AWS (Amplify/Lambda); IAM roles → `deploy-manifest`

### Phase 9 — Marketing & Sales ⬜
- [ ] Campaigns, content, lead gen → `campaign-report`

### Phase 10 — Operations & Maintenance ⬜
- [ ] Release, monitoring, error visibility → `ops-report`

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
