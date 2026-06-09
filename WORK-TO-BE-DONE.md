# Work To Be Done — Progress Tracker

> **Purpose:** the living checklist of what's done and what's left. Each session,
> check off `[x]` what got completed, add new tasks, and keep "Where we are now"
> current. This is the human-readable status board (CLAUDE.md is the architecture
> doc for the AI agent; the `~/.claude` memory files are the running log).

**Where we are now:** Phases 1–3 built (not yet run live end-to-end — needs the
Anthropic key connected). Next up: **Phase 4 — Pre-Marketing**.

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

### Phase 4 — Pre-Marketing 🚧  *(optional / skippable)* — Stage 1 done
Validation stage 2: landing page + waitlist + pre-sell offer to prove real intent.
- [x] Tools chosen: **marketing-skills** (Corey Haines, MIT) for copy/plan; **Launch UI** (MIT) for the landing page; **Supabase** for the waitlist store
- [x] Vendored 11 marketing-skills playbooks; generalized framework loader to scan multiple `vendor/` sources (now 31 frameworks)
- [x] **Stage 1** — validation-kit generation: positioning + landing copy, de-risking pre-sell offer, qualifying questions, social proof (reuses real Phase-3 forum quotes), distribution plan w/ outreach templates, success thresholds. Auto-selects marketing playbooks. UI + generic skip route.
- [ ] **Stage 2** — generate a deployable **Launch UI** landing page project (own Next/Tailwind-v4/shadcn) from the kit, with a waitlist form
- [ ] **Stage 3** — **Supabase** waitlist store + demand dashboard (signups vs thresholds) + verdict gate → `audience-brief`
- [ ] Live test (needs Anthropic key)

### Phase 5 — Product Design ⬜
- [ ] Design spec, assets, UX direction → `design-spec`

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
