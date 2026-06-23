"use client";

import { useEffect, useState } from "react";

/**
 * Click-to-zoom image (#4). Renders a thumbnail that, on click, opens a full-screen
 * lightbox so the founder can inspect a generated asset at full size before it's used.
 * Closes on backdrop click or Escape. `className` styles the thumbnail.
 */
export function ImageZoom({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        className={`cursor-zoom-in ${className || ""}`}
      />
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <figure className="flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl"
            />
            <figcaption className="flex items-center gap-3 text-xs text-white/70">
              <span>{alt}</span>
              <a href={src} target="_blank" rel="noreferrer" className="text-accent2 hover:text-white">
                Open original ↗
              </a>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
                Close ✕
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
