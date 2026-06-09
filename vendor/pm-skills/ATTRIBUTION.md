# pm-skills (vendored subset)

The `SKILL.md` playbooks under this directory are a **curated subset** vendored
from **[phuryn/pm-skills](https://github.com/phuryn/pm-skills)**, used here as the
Product Owner phase's framework library. They are unmodified copies of the
upstream files.

- **Source:** https://github.com/phuryn/pm-skills
- **License:** MIT (see `LICENSE` in this directory) — attribution preserved per the license.
- **What we use them for:** the Product Owner auto-selects the relevant playbook(s)
  for each idea and loads them into its reasoning when generating clarifying
  questions and synthesizing the product spec. We do not run pm-skills as Claude
  Code plugins; we use the framework knowledge as context for our own Anthropic API calls.

To refresh or add more playbooks, re-download from upstream into the matching
`<plugin>/<skill>/SKILL.md` path. The loader (`lib/frameworks/`) discovers them automatically.
