/**
 * The house writing style for everything a phase generates.
 *
 * Every phase's output lands on a page the founder SKIMS — a white-paper read
 * with a contents nav, not a report they sit down and study. Long, hedged,
 * consultant-grade prose is the single biggest thing that makes those pages
 * unreadable, and it comes from the model, not the layout. So the constraint
 * lives here, next to the prompts, and every phase's system prompt appends it.
 *
 * Rules of thumb baked in below: answer first, hard sentence caps, fragments in
 * lists, no restating the input. Per-field caps still belong in each schema's
 * `description` — this is the floor, not a substitute.
 */
export const SKIMMABLE_STYLE = `
WRITING STYLE (strict — this text is skimmed on a page, not studied):
- Answer first. The first sentence of any prose field IS the conclusion; never build up to it.
- Hard caps: prose fields are at most 3 sentences, each at most 25 words. Prefer 1-2.
- List/array items are FRAGMENTS, not sentences: at most 12 words, no trailing period, front-load the noun or verb that carries the meaning.
- Never restate the input, recap what you were asked, or explain your method. Give the finding.
- Cut hedging and filler: "it's important to note", "in order to", "leverage", "robust", "seamless", "comprehensive", "that being said". Cut adverbs that add no fact.
- Prefer a concrete number, name, or date over an adjective. Specific beats emphatic.
- One idea per field. If a field wants two ideas, keep the one that changes a decision.
`.trim();
