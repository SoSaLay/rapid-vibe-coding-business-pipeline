# ux-ui-agent-skills (vendored subset)

The files under this directory are a **curated subset** vendored from
**[plugin87/ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills)**.
They are unmodified copies of the upstream files.

- **Source:** https://github.com/plugin87/ux-ui-agent-skills
- **License:** MIT — declared in the upstream `package.json` (`"license": "MIT"`).
  The upstream repo has no standalone LICENSE file as of vendoring (June 2026);
  attribution preserved here per that declaration.
- **What we use it for (Product Design phase):**
  - `design-systems/<name>/DESIGN.md` — the 138-system reference library. The phase
    picks 1–2 systems that fit the product and injects their concrete tokens
    (colors, type scale, spacing) as the visual-direction grounding.
  - `taste/design-taste.md` — the "anti-slop" judgment layer, injected when
    generating HTML screen mockups.

**Note:** these files are intentionally *not* named `SKILL.md`, so the generic
`lib/frameworks/` loader ignores them. They are loaded by the phase-specific
helper `lib/design-systems.ts` instead (catalog + selective injection — 138 files
would never be injected wholesale).

**Intentionally not vendored:** the upstream `.claude/skills/` (written to run
inside that repo — they reference repo-local paths), `components/`, `tokens/`,
and validation scripts.
