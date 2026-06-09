# marketing-skills (vendored subset)

The `SKILL.md` playbooks under this directory are a **curated subset** vendored
from **[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)**
(by Corey Haines), used here as the Pre-Marketing phase's marketing framework library.
They are unmodified copies of the upstream files.

- **Source:** https://github.com/coreyhaines31/marketingskills
- **License:** MIT (see `LICENSE` in this directory) — attribution preserved per the license.
- **What we use them for:** the Pre-Marketing phase auto-selects relevant playbooks
  (copywriting, CRO, onboarding, pricing, launch, cold email, customer research, etc.)
  and loads them into the AI's context when generating the validation kit (landing-page
  copy, pre-sell offer, qualifying questions, distribution plan).

Loaded by the same `lib/frameworks/` loader as pm-skills (it scans all sources under
`vendor/`). To refresh or add playbooks, re-download into `<skill>/SKILL.md`.
