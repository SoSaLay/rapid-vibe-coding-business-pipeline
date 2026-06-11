# social-media-skills (vendored subset)

The `SKILL.md` playbooks under this directory are a **curated subset** vendored
from **[charlie947/social-media-skills](https://github.com/charlie947/social-media-skills)**
(by Charlie Hills), used here as the Marketing & Sales phase's content-craft library.
They are unmodified copies of the upstream files.

- **Source:** https://github.com/charlie947/social-media-skills
- **License:** MIT (see `LICENSE` in this directory) — attribution preserved per the license.
- **What we use them for:** the Marketing phase loads these when writing the per-channel
  content batches — voice consistency (voice-builder), hooks (hook-generator), post craft
  (post-writer), quality gating (post-scorer), idea angles (content-matrix), and short-form
  video scripts (reels-scripting). The upstream `voice.md`/`about-me.md` shared-context
  convention is fulfilled automatically from the project's design-spec branding + Phase 4
  positioning instead of hand-written files.
- **Not vendored (deliberate):** the Gemini-dependent graphics skills and the
  LinkedIn-profile mechanics — outside this pipeline's lean, text-first scope.

Loaded by the same `lib/frameworks/` loader as the other vendor sources. To refresh or
add playbooks, re-download into `<skill>/SKILL.md`.
