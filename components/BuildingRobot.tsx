"use client";

import { useEffect } from "react";
import { StopButton } from "./StopButton";

/**
 * Loading art for "your agent is being built": a robot drawn piece by piece
 * (platform → legs → body → arms → head → antenna → face), then it blinks,
 * fades and starts over. Pure SVG + CSS; static and complete under reduced motion.
 */
const PARTS: { d: string; fill?: boolean }[] = [
  { d: "M40 176 H160" }, // platform
  { d: "M82 150 v22 h12 v-22 M106 150 v22 h12 v-22", fill: true }, // legs
  { d: "M68 96 h64 a8 8 0 0 1 8 8 v40 a8 8 0 0 1 -8 8 h-64 a8 8 0 0 1 -8 -8 v-40 a8 8 0 0 1 8 -8 z", fill: true }, // body
  { d: "M60 108 l-16 18 l8 14 M140 108 l16 18 l-8 14" }, // arms
  { d: "M76 48 h48 a8 8 0 0 1 8 8 v24 a8 8 0 0 1 -8 8 h-48 a8 8 0 0 1 -8 -8 v-24 a8 8 0 0 1 8 -8 z", fill: true }, // head
  { d: "M100 48 v-14 M100 26 a4 4 0 1 0 0.01 0" }, // antenna
  { d: "M84 116 h12 M104 116 h12 M84 130 h32" }, // chest panel
];
const STEP = 0.45; // seconds between parts
const CYCLE = 6.5; // seconds per full build

/** Part i draws in its own slot, then every part holds and fades together so the loop restarts clean. */
function drawKeyframes(i: number) {
  const pct = (sec: number) => `${((sec / CYCLE) * 100).toFixed(1)}%`;
  const start = i * STEP;
  return `@keyframes rb-draw-${i} {
    0%, ${pct(start)} { stroke-dashoffset: 1; fill-opacity: 0; opacity: 1; }
    ${pct(start + 0.5)} { stroke-dashoffset: 0; fill-opacity: 0; }
    ${pct(start + 0.75)} { stroke-dashoffset: 0; fill-opacity: 1; }
    84% { stroke-dashoffset: 0; fill-opacity: 1; opacity: 1; }
    94%, 100% { stroke-dashoffset: 0; fill-opacity: 1; opacity: 0; }
  }`;
}

export function BuildingRobot({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      <style>{`
        .rb-part { stroke-dasharray: 1; stroke-dashoffset: 1; fill-opacity: 0; animation-duration: ${CYCLE}s; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        .rb-face { opacity: 0; animation: rb-face ${CYCLE}s ease-in-out infinite; transform-origin: 100px 68px; }
        .rb-spark { animation: rb-spark 1.2s ease-in-out infinite; }
        ${PARTS.map((_, i) => drawKeyframes(i)).join("\n")}
        @keyframes rb-face {
          0%, 52% { opacity: 0; transform: scaleY(1); }
          58% { opacity: 1; transform: scaleY(1); }
          68% { transform: scaleY(0.1); }
          72% { transform: scaleY(1); }
          84% { opacity: 1; }
          94%, 100% { opacity: 0; }
        }
        @keyframes rb-spark { 0%, 100% { opacity: 0.2; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) {
          .rb-part { animation: none; stroke-dashoffset: 0; fill-opacity: 1; }
          .rb-face { animation: none; opacity: 1; }
          .rb-spark { animation: none; }
        }
      `}</style>
      <svg viewBox="0 0 200 200" className="h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {PARTS.map((p, i) => (
          <path
            key={i}
            d={p.d}
            pathLength={1}
            className="rb-part"
            stroke="rgb(var(--c-accent))"
            strokeWidth={2.5}
            fill={p.fill ? "rgb(var(--c-panel))" : "none"}
            style={{ animationName: `rb-draw-${i}` }}
          />
        ))}
        <g className="rb-face" fill="rgb(var(--c-accent))">
          <circle cx="88" cy="68" r="5" />
          <circle cx="112" cy="68" r="5" />
        </g>
        {[
          [30, 60, 0],
          [168, 84, 0.4],
          [160, 36, 0.8],
        ].map(([x, y, delay]) => (
          <path
            key={`${x}`}
            className="rb-spark"
            d={`M${x} ${y - 6} v12 M${x - 6} ${y} h12`}
            stroke="rgb(var(--c-accent2))"
            strokeWidth={2}
            style={{ animationDelay: `${delay}s`, transformBox: "fill-box" }}
          />
        ))}
      </svg>
    </div>
  );
}

/** The one "working on it" look for every stage: the building robot, the step's text, and Stop when it can be stopped. */
export function StageLoading({ text, onStop, size = "lg" }: { text: string; onStop?: () => void; size?: "lg" | "sm" }) {
  // Tell the page work started, so the sidebar shows the stage as working right away.
  useEffect(() => {
    window.dispatchEvent(new Event("pipeline:busy"));
  }, [text]);
  return (
    <div className="flex w-full flex-col items-center gap-3 py-6 text-center">
      <BuildingRobot className={size === "lg" ? "h-48 w-48" : "h-32 w-32"} />
      <p className="text-sm text-fg sm:text-base">{text}</p>
      {onStop && <StopButton onStop={onStop} />}
    </div>
  );
}
