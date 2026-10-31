/** Mutable working grid used while applying one intent to a cloned state. */
import { categoryOrder, cellKey, prefMinMap, takeOrder, cellUseMap } from './accounting';
import { addDays } from './dates';
import { evenSplitLatest, largestRemainder } from './money';
import { futureDays } from './plan';
import type { CategoryId, EngineState, ISODate } from './types';

export interface Work {
  s: EngineState;
  today: ISODate;
  planned: Map<string, number>;
  uses: Map<string, number>;
  prefs: Map<ISODate, number>;
  dayCats: Map<ISODate, Set<CategoryId>>;
  gap: number;
  unallocated: number;
  reasons: string[];
}

export function makeWork(s: EngineState, today: ISODate): Work {
  const planned = new Map<string, number>();
  const dayCats = new Map<ISODate, Set<CategoryId>>();
  for (const a of s.plan!.allocations) {
    planned.set(cellKey(a.day, a.category), a.planned.pence);
    if (!dayCats.has(a.day)) dayCats.set(a.day, new Set());
    dayCats.get(a.day)!.add(a.category);
  }
  return {
    s, today, planned, dayCats,
    uses: cellUseMap(s),
    prefs: prefMinMap(s),
    gap: s.plan!.fundingGap.pence,
    unallocated: s.plan!.unallocated.pence,
    reasons: [...s.plan!.unallocatedReasons],
  };
}

/** Call after changing the ledger, planned purchases or preferences of w.s. */
export function refresh(w: Work) {
  w.uses = cellUseMap(w.s);
  w.prefs = prefMinMap(w.s);
}

export const getP = (w: Work, d: ISODate, c: CategoryId) => w.planned.get(cellKey(d, c)) ?? 0;
export function setP(w: Work, d: ISODate, c: CategoryId, v: number) {
  if (v < 0) throw new Error(`negative planned ${d} ${c}`);
  w.planned.set(cellKey(d, c), v);
  if (!w.dayCats.has(d)) w.dayCats.set(d, new Set());
  w.dayCats.get(d)!.add(c);
}
export const cellUse = (w: Work, d: ISODate, c: CategoryId) => w.uses.get(cellKey(d, c)) ?? 0;

export function cellFree(w: Work, d: ISODate, c: CategoryId, floors: boolean): number {
  let lock = cellUse(w, d, c);
  if (floors) {
    const cat = w.s.profile.categories.find((x) => x.id === c);
    if (cat?.essential && cat.minimumDaily) lock = Math.max(lock, cat.minimumDaily.pence);
  }
  return Math.max(0, getP(w, d, c) - lock);
}

export function cellsOfDay(w: Work, d: ISODate): CategoryId[] {
  return categoryOrder(w.s, w.dayCats.get(d) ?? []).filter((c) => w.dayCats.get(d)?.has(c));
}

/** Unspent, not-set-aside allowance of a day. */
export function dayRemaining(w: Work, d: ISODate): number {
  return cellsOfDay(w, d).reduce((a, c) => a + Math.max(0, getP(w, d, c) - cellUse(w, d, c)), 0);
}

/** Days after today (or [today] on the last day): where automatic reallocation happens. */
export function reallocDays(w: Work): ISODate[] {
  const all = futureDays(w.s, w.today);
  const after = all.filter((d) => d > w.today);
  return after.length ? after : all;
}

/** Days strictly after `d` up to `until` (inclusive) within the plan window. */
export function daysAfter(w: Work, d: ISODate, until?: ISODate): ISODate[] {
  return futureDays(w.s, w.today).filter((x) => x > d && (!until || x <= until));
}

/** Take `amount` from the given categories (in order), spread evenly over `days`
 * (remainder pence on the latest days), never below what is used, essential floors
 * (if `floors`) or kept-available amounts. Returns the amount taken. */
export function takeEven(
  w: Work, cats: CategoryId[], days: ISODate[], amount: number, floors: boolean,
): number {
  let need = amount;
  for (const c of cats) {
    if (need <= 0) break;
    const cap = (d: ISODate) =>
      Math.min(cellFree(w, d, c, floors), Math.max(0, dayRemaining(w, d) - (w.prefs.get(d) ?? 0)));
    let active = days.filter((d) => cap(d) > 0);
    while (need > 0 && active.length) {
      const parts = evenSplitLatest(need, active.length);
      const next: ISODate[] = [];
      let took = 0;
      active.forEach((d, i) => {
        const cp = cap(d);
        const x = Math.min(cp, parts[i]);
        if (x > 0) setP(w, d, c, getP(w, d, c) - x);
        took += x;
        if (cp > parts[i]) next.push(d);
      });
      need -= took;
      if (took === 0) break;
      active = next;
    }
  }
  return amount - need;
}

/** Spread `amount` evenly over `days` (remainder on the latest days), each day split
 * across flexible categories by weight. */
export function addEven(w: Work, amount: number, days: ISODate[]) {
  const cats = w.s.profile.categories;
  const parts = evenSplitLatest(amount, days.length);
  days.forEach((d, i) => {
    const split = largestRemainder(parts[i], cats.map((c) => c.weight));
    cats.forEach((c, j) => split[j] && setP(w, d, c.id, getP(w, d, c.id) + split[j]));
  });
}

/** Take up to `amount` from the other cells of day d (lowest priority first, no floors). */
export function intraDayTake(w: Work, d: ISODate, exclude: CategoryId, amount: number): number {
  let need = amount;
  const order = [...takeOrder(w.s), ...cellsOfDay(w, d).filter((c) => !w.s.profile.categories.some((x) => x.id === c))];
  for (const c of order) {
    if (need <= 0) break;
    if (c === exclude) continue;
    const x = Math.min(need, cellFree(w, d, c, false));
    if (x > 0) { setP(w, d, c, getP(w, d, c) - x); need -= x; }
  }
  return amount - need;
}

export const tomorrowOf = (d: ISODate) => addDays(d, 1);
