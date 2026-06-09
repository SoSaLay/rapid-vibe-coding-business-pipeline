# Rapid Vibe Coding Business Pipeline

> A personal, local-first orchestrator that takes an idea from a spoken thought all the way to a built, deployed, and marketed product — treating every build like a focused hackathon with the structure of a real business.

Each stage of building a business (product, research, design, engineering, QA, deployment, marketing, ops) is a **self-contained phase module**. Phases share context only through versioned **artifacts**, so tools and phases are genuinely plug-and-play — swap an engine, add a phase, wire in a new service without touching the rest.

> ⚠️ **Status: early / work in progress.** Phases 1–3 are built. See [`WORK-TO-BE-DONE.md`](./WORK-TO-BE-DONE.md) for the live roadmap.

## The pipeline

```
🎙️ Business Owner → 🧠 Product Owner → 🔎 Market Researcher → 📣 Pre-Marketing →
🎨 Product Design → 🛠️ Engineering → ✅ QA → 🚀 Deployment → 📈 Marketing & Sales →
🔧 Operations → 🔁 Iteration ↺ (loops back to Product Owner)
```

| # | Phase | Does | Output |
|---|-------|------|--------|
| 1 | **Business Owner** | Capture an idea by voice, text, or pull from Notion | `raw-idea` |
| 2 | **Product Owner** | Pushes back with clarifying questions, then writes a structured spec | `product-spec` |
| 3 | **Market Researcher** *(optional)* | Real demand signal from forums + market/competitor research → verdict | `market-report` |
| 4–11 | Pre-Marketing → Iteration | *(in progress)* | — |

## Highlights

- 🎙️ **Voice-first capture** — free in-browser speech-to-text; drive it from your phone.
- 🧠 **A Product Owner that argues back** — interrogates the idea before speccing, powered by Claude + auto-selected [pm-skills](https://github.com/phuryn/pm-skills) playbooks.
- 🔎 **Evidence-grounded validation** — searches real forum/community discussion via [Exa](https://exa.ai) and synthesizes a build/refine/reject/archive verdict with cited quotes.
- 🧩 **Plug-and-play** — connectors, AI providers, framework packs, and search tools all sit behind small interfaces + registries.
- 🔐 **Local-first** — runs on localhost; all keys are pasted in-app and stored locally, never committed.

## Tech stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Anthropic Claude · Exa · Notion. File-based artifact storage (no database).

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Then connect your keys **in the app** (each is stored locally under `data/`):
- **Claude** (Anthropic) — powers the Product Owner + synthesis.
- **Exa** — powers Market Researcher's online search.
- **Notion** *(optional)* — to pull ideas from a page/database.

You can also provide them via environment instead — see [`.env.example`](./.env.example).

## Project structure

```
app/                     Next.js routes + API handlers
components/               UI (capture, product owner, validation, phase rail)
lib/
  pipeline.ts            canonical phase list + gating rules
  store.ts              artifact envelope + project storage (the "spine")
  connectors/           project-management intake (Notion + stubs)
  llm/                  AI provider interface (Claude)
  frameworks/           pm-skills framework-pack loader
  phases/               per-phase logic
  exa.ts               Exa search client
vendor/pm-skills/        vendored MIT playbooks (see ATTRIBUTION.md)
scripts/                 dev/test utilities
CLAUDE.md                architecture + conventions (for AI agents)
WORK-TO-BE-DONE.md       progress tracker / roadmap
```

Architecture details and the per-phase build pattern live in [`CLAUDE.md`](./CLAUDE.md).

## Credits

- Product-management playbooks vendored from **[pm-skills](https://github.com/phuryn/pm-skills)** (MIT) — see [`vendor/pm-skills/ATTRIBUTION.md`](./vendor/pm-skills/ATTRIBUTION.md).
- Online discussion search by **[Exa](https://exa.ai)**.

## License

MIT — see [`LICENSE`](./LICENSE).
