import { DeployTarget } from "./types";
import { amplifyTarget } from "./amplify";

/** Stubs — visible in the UI, selectable once wired. Same coming_soon pattern as connectors. */
const vercelTarget: DeployTarget = {
  id: "vercel",
  label: "Vercel",
  status: "coming_soon",
  note: "Zero-config Next.js hosting. Dearer at scale than Amplify; no AWS ecosystem.",
  renderRunbook: () => {
    throw new Error("Vercel target not wired yet.");
  },
};

const vpsTarget: DeployTarget = {
  id: "vps",
  label: "VPS (self-hosted)",
  status: "coming_soon",
  note: "Your own server (Hetzner/DigitalOcean) — cheapest at scale, most ops burden.",
  renderRunbook: () => {
    throw new Error("VPS target not wired yet.");
  },
};

export const DEPLOY_TARGETS: DeployTarget[] = [amplifyTarget, vercelTarget, vpsTarget];

export function getDeployTarget(id: string): DeployTarget | null {
  return DEPLOY_TARGETS.find((t) => t.id === id) ?? null;
}

export function deployTargetInfo() {
  return DEPLOY_TARGETS.map(({ id, label, status, note }) => ({ id, label, status, note }));
}
