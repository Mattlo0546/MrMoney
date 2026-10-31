/** Mutable working grid used while applying one intent to a cloned state. */
import { capSeries, categoryOrder, cellKey, prefMinMap, takeOrder, cellUseMap } from './accounting';
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

export const isEssential = (w: Work, c: CategoryId) => !!w.s.profile.categories.find((x) => x.id === c)?.essential;

/** How the same-day step may take from a day's other categories:
 * 'any' (no floors), 'floors' (essentials keep their minimumDaily),
 * 'nonEssential' (essential categories are never touched). */
export type IntraDayMode = 'any' | 'floors' | 'nonEssential';

/** Take up to `amount` from the other cells of day d (lowest priority first). */
export function intraDayTake(w: Work, d: ISODate, exclude: CategoryId, amount: number, mode: IntraDayMode = 'floors'): number {
  let need = amount;
  const order = [...takeOrder(w.s), ...cellsOfDay(w, d).filter((c) => !w.s.profile.categories.some((x) => x.id === c))];
  for (const c of order) {
    if (need <= 0) break;
    if (c === exclude) continue;
    if (mode === 'nonEssential' && isEssential(w, c)) continue;
    const x = Math.min(need, cellFree(w, d, c, mode !== 'any'));
    if (x > 0) { setP(w, d, c, getP(w, d, c) - x); need -= x; }
  }
  return amount - need;
}

/** What day d can give a purchase in category c without touching essentials: the
 * unused part of c's own cell plus the unused non-essential cells. */
export function dayAvailable(w: Work, d: ISODate, c: CategoryId): number {
  return cellsOfDay(w, d).reduce((a, x) => {
    if (x !== c && isEssential(w, x)) return a;
    return a + Math.max(0, getP(w, d, x) - cellUse(w, d, x));
  }, 0);
}

/** Planned decreases on days other than `except` between two snapshots, by category. */
export function movesBetween(
  w: Work, before: Map<string, number>, except?: ISODate,
): { category: CategoryId; amount: number; days: ISODate[] }[] {
  const acc = new Map<CategoryId, { amount: number; days: Set<ISODate> }>();
  for (const [k, v] of before) {
    const now = w.planned.get(k) ?? 0;
    if (now >= v) continue;
    const [d, c] = k.split('|');
    if (d === except) continue;
    if (!acc.has(c)) acc.set(c, { amount: 0, days: new Set() });
    acc.get(c)!.amount += v - now;
    acc.get(c)!.days.add(d);
  }
  return categoryOrder(w.s, acc.keys())
    .filter((c) => acc.has(c))
    .map((c) => ({ category: c, amount: acc.get(c)!.amount, days: [...acc.get(c)!.days].sort() }));
}

/**
 * Cash repair (fallback when an incremental change breaks I3): wherever cumulative
 * planned spending runs ahead of the cash cap, move the excess from the days up to that
 * point (today last) to the days after it, taking in take order with essential floors.
 * Returns false if it cannot repair (the caller then re-plans in full).
 */
export function repairCash(w: Work): boolean {
  const W = futureDays(w.s, w.today);
  if (!W.length) return false;
  for (let guard = 0; guard < 4 * W.length + 8; guard++) {
    const caps = capSeries(w.s, w.today, W);
    const byDay = new Map<ISODate, number>();
    for (const [k, v] of w.planned) {
      const d = k.slice(0, 10);
      if (d >= w.today) byDay.set(d, (byDay.get(d) ?? 0) + v);
    }
    const useByDay = new Map<ISODate, number>();
    for (const [k, v] of w.uses) {
      const d = k.slice(0, 10);
      if (d >= w.today) useByDay.set(d, (useByDay.get(d) ?? 0) + v);
    }
    let p = 0, u = 0, bad = -1, excess = 0;
    for (let i = 0; i < W.length; i++) {
      p += byDay.get(W[i]) ?? 0;
      u += useByDay.get(W[i]) ?? 0;
      const lim = Math.max(caps[i], u);
      if (p > lim) { bad = i; excess = p - lim; break; }
    }
    if (bad < 0) return true;
    if (bad === W.length - 1) return false;
    const order = takeOrder(w.s);
    let taken = takeEven(w, order, W.slice(1, bad + 1), excess, true);
    if (taken < excess) taken += takeEven(w, order, [W[0]], excess - taken, true);
    if (taken < excess) {
      if (taken > 0) addEven(w, taken, W.slice(bad + 1));
      return false;
    }
    addEven(w, taken, W.slice(bad + 1));
  }
  return false;
}

export const tomorrowOf = (d: ISODate) => addDays(d, 1);
