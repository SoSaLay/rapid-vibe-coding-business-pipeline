import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        panel: "#11141c",
        edge: "#1e2330",
        muted: "#8b93a7",
        accent: "#6366f1",
        accent2: "#22d3ee",
        ok: "#34d399",
        warn: "#fbbf24",
        bad: "#f87171",
      },
    },
  },
  plugins: [],
};

export default config;
