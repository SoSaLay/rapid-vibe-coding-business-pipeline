import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All tokens are CSS-variable backed (space-separated RGB channels) so a
        // single class works in both dark and light mode and still supports the
        // /opacity modifier. Values live in app/globals.css (:root + .light).
        ink: "rgb(var(--c-ink) / <alpha-value>)", // sunken surface (wells, inputs, code blocks)
        panel: "rgb(var(--c-panel) / <alpha-value>)", // card / sheet surface
        edge: "rgb(var(--c-edge) / <alpha-value>)", // hairline borders
        muted: "rgb(var(--c-muted) / <alpha-value>)", // secondary text
        fg: "rgb(var(--c-fg) / <alpha-value>)", // primary text (was text-white)
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        accent2: "rgb(var(--c-accent2) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
        onbright: "rgb(var(--c-onbright) / <alpha-value>)", // text on solid ok/warn badges
      },
    },
  },
  plugins: [],
};

export default config;
