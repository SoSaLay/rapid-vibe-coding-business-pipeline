# Rapid Vibe Coding Business Pipeline

A personal, localhost orchestrator that takes an idea from raw thought → spec → validated market → (eventually) built, deployed, and marketed product. Each business phase is a self-contained module connected only through shared **artifacts**, so phases and tools are plug-and-play.

> **For the AI agent reading this:** This file is the durable, in-repo source of truth for how this project is built (architecture + conventions). **Progress and the task checklist live in `WORK-TO-BE-DONE.md`** — read it at the start of each session to see what's done and what's next, and check off `[x]` items / add tasks as you complete work. There is also a richer running log in the user's Claude memory (`~/.claude/projects/<this-project>/memory/MEMORY.md`). The user builds this **one phase at a time** and supplies the tools to integrate per phase; don't scaffold ahead. Keep everything behind interfaces so tools stay swappable.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000  (phone: http://<LAN-IP>:3000)
npx tsc --noEmit   # typecheck (run after changes)
```

Node 22, Next.js 14 (App Router), React 18, TypeScript, Tailwind v3. Local file storage (no DB). Keys/secrets are pasted in-app and stored under `data/` (gitignored) — never hard-coded.

## Architecture

### The spine (shared by every phase)
- `lib/pipeline.ts` — the canonical phase list (`PHASES`), each with `consumes`/`produces` artifact types and a `gate` (`required` | `optional`). **Single source of truth for ordering + the status/gating layer.**
- `lib/store.ts` — the **artifact envelope** + project store. Artifacts are versioned JSON on disk:
  - `data/projects/<id>/meta.json` — `ProjectMeta` (title, `current_phase`, `phase_status` map: locked|available|active|complete|skipped|rejected)
  - `data/projects/<id>/artifacts/<type>.v<n>.json` — the envelopes
  - `data/projects/<id>/phase-state/<phaseId>.json` — a phase's mutable working scratchpad
  - Helpers: `createProject`, `saveArtifact`, `listArtifacts`, `latestArtifact`, `get/savePhaseState`, `completePhase`, `skipPhase` (optional phases only).

**The artifact envelope is the only cross-phase contract.** A phase reads the artifacts it depends on and writes a new one. That's what makes it plug-and-play.

### Pluggable services (same registry pattern each time)
- `lib/connectors/` — project-management intake (Notion fully wired; ClickUp/Jira/etc. are identical-shape `coming_soon` stubs). Interface in `types.ts`, registry in `registry.ts`, credentials in `config.ts`.
- `lib/llm/` — the AI engine behind phases. `LlmProvider` interface; Claude (`anthropic.ts`, model `claude-opus-4-8`, adaptive thinking, structured outputs `output_config.format`, prompt caching) is the active provider via `activeProvider()`.
- `lib/frameworks/` — the **framework-pack layer**. Loads pm-skills playbooks vendored under `vendor/pm-skills/` (MIT, see `ATTRIBUTION.md`) and exposes them so phases can inject proven PM frameworks into the LLM's context. Phase-agnostic and reused across phases.
- `lib/exa.ts` — Exa search client (online signal for the Market Researcher phase). Key pasted in-app. **Note: Exa cannot search Reddit** (Reddit blocked crawlers in 2024) — `reddit.com` is excluded; forums-in-general work well.

### Per-phase pattern (how to add the next phase)
1. Add/confirm the phase in `lib/pipeline.ts` (`consumes`/`produces`/`gate`).
2. Logic in `lib/phases/<phase>.ts` — reads upstream artifact(s) via `latestArtifact`, calls `activeProvider()` + any tools, optionally injects frameworks via `buildFrameworkContext`, returns structured output.
3. API routes under `app/api/projects/[id]/<phase>/...` — produce the artifact via `saveArtifact`, then `completePhase` (or `skipPhase` for optional).
4. UI component in `components/`, rendered by the workspace `app/project/[id]/page.tsx`.
5. Run `npx tsc --noEmit`; smoke-test the routes.

## Phases (11 total)
1. **Business Owner** — capture idea (voice via free Web Speech API / text / pull from Notion) → `raw-idea`.
2. **Product Owner** — pushes back with clarifying questions, then synthesizes → `product-spec`. Auto-selects pm-skills playbooks per idea.
3. **Market Researcher** — *optional/skippable* (nudge to do it if monetizing). Exa forum search (demand) + market/competitor search → `market-report` with a build/refine/reject/archive verdict.
4. Pre-Marketing · 5. Product Design · 6. Development & Engineering (System Design Architect; spec-driven; Claude Code executes tasks) · 7. QA (auto + **manual** + security) · 8. Deployment (Dev/UAT/Prod; AWS) · 9. Marketing & Sales · 10. Operations & Maintenance · 11. Iteration → loops back to Product Owner.

## Key decisions
- **Default stack the pipeline RECOMMENDS for apps it builds** (not the orchestrator itself): Next.js + AWS Amplify hosting + AWS Lambda + Supabase + Clerk. Deviations should warn about cost/complexity. (To be enforced in the Engineering phase.)
- **Engineering tools on the shelf for Phase 6:** OpenSpec + gsd-core (both spec-driven AI-coding execution; they overlap — pick one or compose later). Fed by `product-spec`.
- **Open-source Tool Directory (future cross-cutting feature):** pull any repo → Dockerize → host → dashboard control panel; a tool can be a standalone hosted app OR an engine wired into a phase. Build as its own feature later; keep phase engines behind interfaces.

## Conventions
- Keys/secrets: in-app paste → `data/` (gitignored). Never commit secrets.
- Every new tool/provider goes behind an interface + registry so it's swappable.
- Mobile-friendly UI (the owner drives this from a phone).
- After code changes, `npx tsc --noEmit` must pass.
