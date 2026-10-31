/** Test helpers (not exported from index). */
import fc from 'fast-check';
import { expect } from 'vitest';
import { addDays } from './dates';
import { formatMoney, gbp, isMoney } from './money';
import type { ChangeSet, EngineState, Explanation, Intent, Money } from './types';

export const START = '2026-11-10';

export interface GenSpec {
  funds: number; monthly: boolean; days: number; reserve: number; savings: number;
  bills: { amount: number; day: number; monthly: boolean; offset: number }[];
  incomes: { amount: number; offset: number; confirmed: boolean }[];
  weights: number[];
  floors: number[];
}

export const arbSpec: fc.Arbitrary<GenSpec> = fc.record({
  funds: fc.integer({ min: 0, max: 1_500_000 }),
  monthly: fc.boolean(),
  days: fc.integer({ min: 1, max: 120 }),
  reserve: fc.integer({ min: 0, max: 150_000 }),
  savings: fc.integer({ min: 0, max: 80_000 }),
  bills: fc.array(fc.record({ amount: fc.integer({ min: 0, max: 120_000 }), day: fc.integer({ min: 1, max: 31 }), monthly: fc.boolean(), offset: fc.integer({ min: 0, max: 120 }) }), { maxLength: 4 }),
  incomes: fc.array(fc.record({ amount: fc.integer({ min: 0, max: 300_000 }), offset: fc.integer({ min: 0, max: 120 }), confirmed: fc.boolean() }), { maxLength: 3 }),
  weights: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 5 }).filter((ws) => ws.some((w) => w > 0)),
  floors: fc.array(fc.integer({ min: 0, max: 800 }), { minLength: 5, maxLength: 5 }),
});

export function buildState(g: GenSpec): EngineState {
  return {
    schemaVersion: 1,
    profile: {
      funds: gbp(g.monthly ? Math.floor(g.funds / 4) : g.funds),
      fundsType: g.monthly ? 'monthly' : 'lump',
      allowanceDay: 5,
      openingBalance: g.monthly ? gbp(Math.floor(g.funds / 10)) : undefined,
      planStart: START,
      horizonEnd: addDays(START, g.days - 1),
      minimumReserve: gbp(g.reserve),
      savingsGoal: gbp(g.savings),
      hasJob: false,
      categories: g.weights.map((w, i) => ({
        id: `c${i}`, name: `Cat ${i}`, weight: w, priority: i + 1, essential: i < 2,
        minimumDaily: i < 2 && g.floors[i] > 0 ? gbp(g.floors[i]) : undefined,
      })),
    },
    commitments: g.bills.map((b, i) => ({
      id: `b${i}`, name: `Bill ${i}`, amount: gbp(b.amount), locked: true,
      recurrence: b.monthly ? { kind: 'monthly' as const, dayOfMonth: b.day } : { kind: 'once' as const, date: addDays(START, b.offset) },
    })),
    incomes: g.incomes.map((x, i) => ({ id: `i${i}`, amount: gbp(x.amount), date: addDays(START, x.offset), source: 'other' as const, confirmed: x.confirmed })),
    ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null,
  };
}

export const arbIntent = (days: number, cats: number, k: number): fc.Arbitrary<Intent> =>
  fc.oneof(
    fc.record({ amount: fc.integer({ min: 1, max: 60_000 }), cat: fc.integer({ min: 0, max: cats }) }).map(
      (x): Intent => ({ kind: 'expense', amount: gbp(x.amount), date: START, category: x.cat === cats ? 'household' : `c${x.cat}`, idempotencyKey: `e${k}` })),
    fc.record({ amount: fc.integer({ min: 1, max: 20_000 }), off: fc.integer({ min: 0, max: days - 1 }), cat: fc.integer({ min: 0, max: cats - 1 }), opt: fc.integer({ min: -1, max: 4 }) }).map(
      (x): Intent => ({
        kind: 'hypothetical', amount: gbp(x.amount), date: addDays(START, x.off), category: `c${x.cat}`, idempotencyKey: `h${k}`,
        tradeoffOptionId: x.opt < 0 ? undefined : [`c${cats - 1}-later`, `c${cats - 2}-two-weeks`, 'all-flexible-rest', 'earlier-days', 'no-such-option'][x.opt],
      })),
    fc.record({ amount: fc.integer({ min: 1, max: 100_000 }), off: fc.integer({ min: 0, max: days + 5 }) }).map(
      (x): Intent => ({ kind: 'income', amount: gbp(x.amount), date: addDays(START, x.off > days ? 0 : x.off), idempotencyKey: `i${k}` })),
    fc.record({ amount: fc.integer({ min: 1, max: 5_000 }), off: fc.integer({ min: 0, max: days - 1 }) }).map(
      (x): Intent => ({ kind: 'preference', amount: gbp(x.amount), date: addDays(START, x.off), idempotencyKey: `p${k}` })),
    fc.integer({ min: 1, max: 20_000 }).map((a): Intent => ({ kind: 'goal', amount: gbp(a), idempotencyKey: `g${k}` })),
  );

/** Read a ChangeSet field by a path such as "borrowed.sources[0].amount". */
export function resolvePath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, part) => {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!m || o == null) return undefined;
    let cur = (o as Record<string, unknown>)[m[1]];
    for (const idx of m[2].match(/\d+/g) ?? []) cur = cur == null ? undefined : (cur as unknown[])[Number(idx)];
    return cur;
  }, obj);
}

/** I11 (strict): the £ figures in the sentence, in order, are exactly the explanation's
 * mentions, and each mention equals the ChangeSet field its path names. */
export function assertExplanationFromDiff(e: Explanation, diff: ChangeSet) {
  const nums = e.sentence.match(/-?£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
  expect(nums, e.sentence).toEqual((e.mentions ?? []).map((x) => x.text));
  for (const m of e.mentions ?? []) {
    const v = resolvePath(diff, m.path) as Money | undefined;
    expect(v && isMoney(v), `${m.path} in "${e.sentence}"`).toBe(true);
    expect(formatMoney(v!), `${m.path} in "${e.sentence}"`).toBe(m.text);
  }
}
