# ui-ux-pro-max (vendored subset)

The `ui-ux-pro-max/SKILL.md` playbook under this directory is vendored from
**[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)**.
It is an unmodified copy of the upstream skill file.

- **Source:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **License:** MIT (see `LICENSE` in this directory) — attribution preserved per the license.
- **What we use it for:** the Product Design phase always loads this playbook as its
  hard-rules layer — prioritized UI/UX rule categories (accessibility, touch targets,
  typography, layout, animation, forms, navigation), 50+ named UI styles, and
  product-type reasoning rules that constrain both the design brief and the HTML
  screen mockups.

**Intentionally not vendored:** the upstream Python search engine + CSV databases
(`src/ui-ux-pro-max/`) and the `ui-styling` skill (shadcn/Tailwind implementation
guidance + bundled fonts) — the markdown rules are the part this phase consumes.
If palette/font-pairing lookups are wanted later, port the small CSVs into
`lib/` rather than shelling out to Python.

Loaded by the same `lib/frameworks/` loader as pm-skills and marketing-skills.
