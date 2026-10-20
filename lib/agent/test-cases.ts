/**
 * Changing test cases: remove ones that no longer make sense, or correct one whose expected outcome or
 * test data is wrong. Every change writes a NEW dataset version (earlier ones stay in evals/versions/)
 * and is remembered as an override, so the next "Create new test cases" or rebuild doesn't bring the
 * old version back. Cases from example tasks are also corrected in the Engineering example tests.
 */

import { promises as fs } from "fs";
import path from "path";
import { loadBuild } from "./build-context";
import { getEvals, saveEvals, type CaseOverride } from "./evals-state";
import { writeCodebase } from "../phases/agent-engineering";
import type { Dataset, EvalCase } from "../phases/agent-evals";
import type { ExampleTask, FilledLogic } from "./types";

export interface CaseChange {
  id: string;
  remove?: boolean;
  expected?: string;
  fixtures?: Record<string, string | string[]>;
}

async function readJson<T>(file: string): Promise<T | null> {
  return fs.readFile(file, "utf8").then((t) => JSON.parse(t) as T).catch(() => null);
}

/** The override key: example cases by their example task's wording (positions shift), others by id. */
function keyFor(c: EvalCase, examples: { input: string }[]): string {
  if (c.example_input) return `example:${c.example_input}`;
  const m = /^example-(\d+)$/.exec(c.id);
  if (m && examples[Number(m[1]) - 1]) return `example:${examples[Number(m[1]) - 1].input}`;
  return c.id;
}

/** Apply saved overrides to a dataset (after it's generated or changed). */
export function applyCaseOverrides(dataset: Dataset, overrides: Record<string, CaseOverride> | undefined, examples: { input: string }[]): Dataset {
  if (!overrides || !Object.keys(overrides).length) return dataset;
  const cases = dataset.cases
    .filter((c) => !overrides[keyFor(c, examples)]?.removed)
    .map((c) => {
      const o = overrides[keyFor(c, examples)];
      return o ? { ...c, expected: o.expected ?? c.expected, fixtures: o.fixtures ?? c.fixtures } : c;
    });
  return { ...dataset, cases };
}

/** Apply saved overrides to the example tasks before the agent is rendered (Engineering's example tests). */
export async function overrideExamples(projectId: string, tasks: ExampleTask[], logic: FilledLogic): Promise<{ tasks: ExampleTask[]; logic: FilledLogic }> {
  const overrides = (await getEvals(projectId)).case_overrides ?? {};
  if (!Object.keys(overrides).some((k) => k.startsWith("example:"))) return { tasks, logic };
  const kept = tasks.map((t, i) => ({ t, i })).filter(({ t }) => !overrides[`example:${t.input}`]?.removed);
  return {
    tasks: kept.map(({ t }) => ({ ...t, expected: overrides[`example:${t.input}`]?.expected ?? t.expected })),
    logic: {
      ...logic,
      examples: logic.examples
        .filter((e) => kept.some((k) => k.i === e.index))
        .map((e) => {
          const at = kept.findIndex((k) => k.i === e.index);
          const fx = overrides[`example:${tasks[e.index].input}`]?.fixtures;
          return {
            ...e,
            index: at,
            fixtures: fx ? Object.entries(fx).flatMap(([tool, r]) => (Array.isArray(r) ? r : [r]).map((response) => ({ tool, response }))) : e.fixtures,
          };
        }),
    },
  };
}

/** Remove or correct test cases: writes the next dataset version and remembers the change. */
export async function changeTestCases(projectId: string, changes: CaseChange[], why: string): Promise<{ version: number; removed: number; updated: number }> {
  const ctx = await loadBuild(projectId);
  const file = path.join(ctx.dir, "evals", "dataset.json");
  const dataset = await readJson<Dataset>(file);
  if (!dataset) throw new Error("No test cases yet.");
  const examplesFile = path.join(ctx.dir, "tests", "examples.json");
  const examples = (await readJson<any[]>(examplesFile)) ?? [];
  const state = await getEvals(projectId);
  const overrides = { ...(state.case_overrides ?? {}) };
  const at = new Date().toISOString();
  let removed = 0;
  let updated = 0;
  let exampleChanged = false;
  for (const ch of changes) {
    const c = dataset.cases.find((x) => x.id === ch.id);
    if (!c) continue;
    const key = keyFor(c, examples);
    if (key.startsWith("example:")) exampleChanged = true;
    if (ch.remove) {
      overrides[key] = { removed: true, why, at };
      removed++;
    } else if (ch.expected || ch.fixtures) {
      overrides[key] = { ...overrides[key], expected: ch.expected || overrides[key]?.expected, fixtures: ch.fixtures ?? overrides[key]?.fixtures, why, at };
      updated++;
    }
  }
  if (!removed && !updated) throw new Error("None of those test cases were found.");

  const next: Dataset = { ...applyCaseOverrides(dataset, overrides, examples), version: dataset.version + 1, created_at: at };
  const files = [
    { path: "evals/dataset.json", content: JSON.stringify(next, null, 2) + "\n", explains: "" },
    { path: `evals/versions/dataset.v${next.version}.json`, content: JSON.stringify(next, null, 2) + "\n", explains: "" },
    { path: `evals/versions/dataset.v${dataset.version}.json`, content: JSON.stringify(dataset, null, 2) + "\n", explains: "" },
  ];
  if (exampleChanged) {
    // Engineering's example tests read tests/examples.json: correct it now (rebuilds re-apply the overrides).
    const fixed = examples
      .filter((e) => !overrides[`example:${e.input}`]?.removed)
      .map((e) => {
        const o = overrides[`example:${e.input}`];
        return o ? { ...e, expected: o.expected ?? e.expected, fixtures: o.fixtures ?? e.fixtures } : e;
      });
    files.push({ path: "tests/examples.json", content: JSON.stringify(fixed, null, 2) + "\n", explains: "" });
  }
  await writeCodebase(ctx.dir, files, `evals: dataset v${next.version} (${removed ? `${removed} removed` : ""}${removed && updated ? ", " : ""}${updated ? `${updated} corrected` : ""})`);
  const counts: Record<string, number> = {};
  for (const c of next.cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
  await saveEvals(projectId, { ...(await getEvals(projectId)), dataset_version: next.version, dataset_counts: counts, case_overrides: overrides });
  return { version: next.version, removed, updated };
}
