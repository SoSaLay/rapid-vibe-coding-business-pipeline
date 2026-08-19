/**
 * White-paper document primitives — the shared building blocks for a phase's
 * *informational read*. One flowing sheet of headings and prose: large text,
 * clear headings, generous white space, no nested card boxes.
 *
 * These are intentionally tiny and unopinionated about content. Each phase
 * composes its synthesized data into <Doc> + <DocSection> + the helpers below.
 * Artifact generators do NOT belong here — they live in the artifact view.
 *
 * Typographic scale lives in globals.css under the `.doc*` classes.
 */
"use client";

import { useState, type ReactNode } from "react";
import { sectionAnchor } from "@/lib/pipeline";

/** The document wrapper. Sets the larger reading size + rhythm. */
export function Doc({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`doc ${className}`}>{children}</div>;
}

/**
 * A titled section: a clear heading followed by its body, separated by air.
 * The heading gets an anchor id derived from its title (overridable via `id`)
 * so the sidebar's clickable sections can jump straight to it. `scroll-mt`
 * keeps the heading clear of the top edge when scrolled into view.
 */
export function DocSection({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id ?? sectionAnchor(title)} className="doc-section scroll-mt-24">
      <h2 className="doc-h">{title}</h2>
      {children}
    </section>
  );
}

/** A standard body paragraph. */
export function DocP({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`doc-p ${className}`}>{children}</p>;
}

/** A sub-heading inside a section (e.g. a competitor name, a theme title). */
export function DocSub({ children }: { children: ReactNode }) {
  return <h3 className="doc-sub">{children}</h3>;
}

/** Secondary annotation line (detail under a sub-heading, source, etc.). */
export function DocMuted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`doc-muted ${className}`}>{children}</p>;
}

/** A simple disc list of strings, in document body type. */
export function DocList({ items }: { items: string[] }) {
  return (
    <ul className="doc-p ml-5 list-disc space-y-2">
      {(items ?? []).map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

/** A pull-quote (real voices / testimonials) with an optional attribution link. */
export function DocQuote({ quote, source, url }: { quote: string; source?: string; url?: string }) {
  return (
    <blockquote className="doc-quote">
      <p className="doc-p italic">“{quote}”</p>
      {source &&
        (url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-sm text-accent2 hover:underline">
            {source}
          </a>
        ) : (
          <span className="doc-muted">{source}</span>
        ))}
    </blockquote>
  );
}

/**
 * Generated prose, rendered to be skimmed.
 *
 * Use `tone="lede"` for the takeaway that opens a section — skimming heading →
 * lede → next heading should still carry the argument.
 *
 * Models write paragraphs; this page is scanned. So the first sentence — which
 * the prompts require to BE the conclusion (see lib/phases/brevity.ts) — is
 * always shown, and anything past `clampAt` characters folds behind "Show more".
 * Nothing is discarded: this is what makes the reports already sitting on disk,
 * written before the brevity rules existed, readable at a glance.
 */
const PROSE_TONE = { body: "doc-p", lede: "doc-lede", muted: "doc-muted" } as const;
const PROSE_LIMIT = { body: 320, lede: 260, muted: 200 } as const;

export function DocProse({
  text,
  clampAt,
  tone = "body",
}: {
  text?: string | null;
  clampAt?: number;
  /** "lede" opens a section, "muted" annotates a sub-heading, "body" is prose. */
  tone?: keyof typeof PROSE_TONE;
}) {
  return <ClampedText text={text} clampAt={clampAt ?? PROSE_LIMIT[tone]} className={PROSE_TONE[tone]} />;
}

/**
 * The clamp itself, unstyled. <DocProse> is this with the document's type scale;
 * the card-based workflow phases (Engineering, QA, Deployment, Operations,
 * Iteration) use it directly with their own smaller card type.
 */
export function ClampedText({
  text,
  clampAt = 320,
  className = "",
}: {
  text?: string | null;
  clampAt?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const body = (text ?? "").trim();
  if (!body) return null;

  const head = leadSentences(body, clampAt);
  if (head.length >= body.length) return <p className={className}>{body}</p>;

  return (
    <div>
      <p className={className}>
        {open ? body : head}
        {!open && <span className="text-muted">…</span>}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 text-[12px] font-medium text-accent2 transition-colors hover:text-fg"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

/**
 * Cut at a sentence boundary at or before `limit`, so the visible head is always
 * whole sentences. Falls back to the first sentence when even that runs long —
 * a half-sentence teaser is worse than one long true one.
 */
function leadSentences(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const ends = [...text.matchAll(/[.!?](\s|$)/g)].map((m) => m.index! + 1);
  const fit = ends.filter((i) => i <= limit);
  return text.slice(0, fit.length ? fit[fit.length - 1] : ends[0] ?? limit).trim();
}

/**
 * A compact label/value grid for the facts a founder scans for (verdict, price,
 * target, cadence). Rows, not prose — the whole point is not reading sentences.
 */
export function DocFacts({ items }: { items: { label: string; value?: ReactNode }[] }) {
  const rows = items.filter((i) => i.value !== undefined && i.value !== null && i.value !== "");
  if (!rows.length) return null;
  return (
    <dl className="doc-facts">
      {rows.map((r) => (
        <div key={r.label} className="doc-facts-row">
          <dt className="doc-facts-label">{r.label}</dt>
          <dd className="doc-facts-value">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
