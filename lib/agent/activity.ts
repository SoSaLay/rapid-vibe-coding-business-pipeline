/**
 * Long jobs running on this server, per project and stage (an evaluation run, writing test cases, a live
 * check, a build step, an AI fix…), so the sidebar can show the stage as working and the page keeps
 * itself current while they run. In memory: a job only exists while its request is running.
 */

import { AsyncLocalStorage } from "async_hooks";
import type { NextRequest } from "next/server";

/** Which project the current request works for, so the AI engine can bill its calls to it. */
const g0 = globalThis as unknown as { __aiProject?: AsyncLocalStorage<{ projectId: string }> };
g0.__aiProject ??= new AsyncLocalStorage();
const projectContext = g0.__aiProject;

export function currentProject(): string | undefined {
  return projectContext.getStore()?.projectId;
}

export interface Activity {
  id: number;
  phase: string;
  label: string;
  started_at: string;
}

// Shared across route bundles (Next can load this module more than once in one server process).
const g = globalThis as unknown as { __activity?: { next: number; byProject: Map<string, Activity[]> } };
g.__activity ??= { next: 1, byProject: new Map() };
const store = g.__activity;

export function beginActivity(projectId: string, phase: string, label: string): () => void {
  const a: Activity = { id: store.next++, phase, label, started_at: new Date().toISOString() };
  store.byProject.set(projectId, [...(store.byProject.get(projectId) ?? []), a]);
  return () => store.byProject.set(projectId, (store.byProject.get(projectId) ?? []).filter((x) => x.id !== a.id));
}

export function activities(projectId: string): Activity[] {
  return store.byProject.get(projectId) ?? [];
}

type Handler = (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

/** Wrap a route's POST so the stage shows as working while the request runs (and its AI calls are billed to the project). */
export function tracked(phase: string, label: string, handler: Handler): Handler {
  return async (req, ctx) => {
    const end = beginActivity(ctx.params.id, phase, label);
    try {
      return await projectContext.run({ projectId: ctx.params.id }, () => handler(req, ctx));
    } finally {
      end();
    }
  };
}

/** Wrap a route's POST so the AI calls it makes are billed to the project (no "working" indicator). */
export function attributed(handler: Handler): Handler {
  return (req, ctx) => projectContext.run({ projectId: ctx.params.id }, () => handler(req, ctx));
}
