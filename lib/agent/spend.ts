/**
 * Testing spend: what evaluations and live checks cost in model credits (the agent's runs plus grading),
 * per agent and in total, against an optional monthly budget. Kept in data/connectors/testing-spend.json.
 *
 * When this month's total reaches the budget, automatic work that spends credits pauses (auto-checks,
 * automatic releases); anything the owner starts by hand asks first.
 */

import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";

export interface SpendEntry {
  at: string;
  project: string;
  /** "evaluations" | "live check" */
  what: string;
  usd: number;
}

interface SpendFile {
  /** Monthly testing budget per agent (project id → dollars). */
  budgets?: Record<string, number>;
  entries?: SpendEntry[];
}

const KEY = "testing-spend";
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

async function load(): Promise<SpendFile> {
  return ((await readConnectorConfig(KEY)) as SpendFile | null) ?? {};
}

// Writes one at a time (many AI calls can finish together; a read-modify-write race would drop entries).
let queue: Promise<unknown> = Promise.resolve();

export function recordSpend(project: string, what: string, usd: number | null | undefined): Promise<void> {
  if (!usd || usd <= 0) return Promise.resolve();
  const p = queue.then(() => append(project, what, usd));
  queue = p.catch(() => {});
  return p;
}

async function append(project: string, what: string, usd: number) {
  const f = await load();
  // Keep about a year of entries.
  const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const entries = [...(f.entries ?? []).filter((e) => e.at >= cutoff), { at: new Date().toISOString(), project, what, usd }];
  await saveConnectorConfig(KEY, { ...f, entries } as any);
}

export async function setSpendBudget(project: string, usd: number | null) {
  const f = await load();
  const budgets = { ...(f.budgets ?? {}) };
  if (usd && usd > 0) budgets[project] = usd;
  else delete budgets[project];
  await saveConnectorConfig(KEY, { ...f, budgets } as any);
}

/** One agent's AI spend this month. "pipeline AI" entries are development; everything else is testing. */
export interface SpendStatus {
  total_usd: number;
  development_usd: number;
  testing_usd: number;
  /** The last testing run and what it cost. */
  last_test?: SpendEntry;
  /** This agent's monthly testing budget (null = none). */
  budget_usd: number | null;
  over_budget: boolean;
}

export async function spendStatus(project: string): Promise<SpendStatus> {
  const f = await load();
  const mine = (f.entries ?? []).filter((e) => e.project === project);
  const month = mine.filter((e) => e.at >= monthStart());
  const development_usd = month.filter((e) => e.what === "pipeline AI").reduce((a, e) => a + e.usd, 0);
  const testing_usd = month.filter((e) => e.what !== "pipeline AI").reduce((a, e) => a + e.usd, 0);
  const budget = f.budgets?.[project] ?? null;
  return {
    total_usd: development_usd + testing_usd,
    development_usd,
    testing_usd,
    last_test: [...mine].reverse().find((e) => e.what !== "pipeline AI"),
    budget_usd: budget,
    over_budget: budget !== null && testing_usd >= budget,
  };
}

/** The message shown when work is paused for the budget. */
export function budgetMessage(s: SpendStatus) {
  return `This agent's testing budget for the month is used up ($${s.testing_usd.toFixed(2)} of $${(s.budget_usd ?? 0).toFixed(2)}). Raise it, or confirm to run anyway.`;
}
