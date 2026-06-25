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
import type { ReactNode } from "react";
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
