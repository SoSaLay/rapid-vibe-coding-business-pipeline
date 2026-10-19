import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { loadBuild } from "@/lib/agent/build-context";

const exec = promisify(execFile);
const APPS: Record<string, { name: string; bundle: string }> = {
  vscode: { name: "Visual Studio Code", bundle: "com.microsoft.VSCode" },
  cursor: { name: "Cursor", bundle: "com.todesktop.230313mzl4w4u92" },
};

/** Is the app on this Mac? Found by bundle id, so it works wherever it's installed. */
async function installed(bundle: string): Promise<boolean> {
  try {
    const { stdout } = await exec("mdfind", [`kMDItemCFBundleIdentifier == '${bundle}'`]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Which editors are installed: { vscode: boolean, cursor: boolean }. */
export async function GET() {
  const entries = await Promise.all(Object.entries(APPS).map(async ([id, a]) => [id, await installed(a.bundle)] as const));
  return NextResponse.json(Object.fromEntries(entries));
}

/** Body: { app: "vscode" | "cursor" } — open the agent's folder in that editor on this Mac. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const app = APPS[b.app];
  if (!app) return NextResponse.json({ error: "Unknown editor." }, { status: 400 });
  const ctx = await loadBuild(params.id);
  const dir = ctx.build?.workspace_path;
  if (!dir) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  try {
    await exec("open", ["-a", app.name, dir]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: `Couldn't open ${app.name}. Is it installed?`, missing: true }, { status: 400 });
  }
}
