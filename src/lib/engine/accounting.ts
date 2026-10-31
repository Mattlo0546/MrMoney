/**
 * Cash-flow accounting from the start of `today` (SOD).
 *
 * balanceSOD = opening + inflows[planStart, today) − bills[planStart, today) − expenses[planStart, today)
 * pool       = balanceSOD + inflows[today, end] − bills[today, end] − reserve − savingsGoal
 * Cap(t)     = balanceSOD − held(t) + inflows[today, t] − bills[today, t]
 *              (the most flexible money that can have been spent by the end of day t)
 * held(t)    = reserve (from today) + savings due by t: savings deadlines with byDate <= t,
 *              and the whole savings goal on the last day of the plan.
 */
import { addDays, daysInMonth, makeDate, parseISODate } from './dates';
import { occurrences, type Occurrence } from './recurrence';
import type { CategoryId, EngineState, ISODate, Profile } from './types';

export interface CashEvent {
  date: ISODate;
  pence: number;
  label: string;
}

export const cellKey = (day: ISODate, cat: CategoryId) => `${day}|${cat}`;

export function openingBalance(p: Profile): number {
  return p.fundsType === 'lump' ? p.funds.pence : (p.openingBalance?.pence ?? 0);
}

function allowanceEvents(p: Profile, from: ISODate, to: ISODate): CashEvent[] {
  if (p.fundsType !== 'monthly') return [];
  const lo = from > p.planStart ? from : p.planStart;
  const hi = to < p.horizonEnd ? to : p.horizonEnd;
  if (hi < lo) return [];
  const out: CashEvent[] = [];
  const a = parseISODate(lo)!, b = parseISODate(hi)!;
  const day = p.allowanceDay ?? 1;
  let y = a.y, m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    const d = makeDate(y, m, Math.min(day, daysInMonth(y, m)));
    if (d >= lo && d <= hi) out.push({ date: d, pence: p.funds.pence, label: 'Monthly allowance' });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Confirmed inflows in [from, to]: confirmed incomes, ledger income, monthly allowances. */
export function inflowEvents(s: EngineState, from: ISODate, to: ISODate): CashEvent[] {
  const out: CashEvent[] = [];
  for (const i of s.incomes)
    if (i.confirmed && i.date >= from && i.date <= to)
      out.push({ date: i.date, pence: i.amount.pence, label: i.note ?? 'Income' });
  for (const t of s.ledger)
    if (t.kind === 'income' && t.date >= from && t.date <= to)
      out.push({ date: t.date, pence: t.amount.pence, label: t.note ?? 'Income' });
  out.push(...allowanceEvents(s.profile, from, to));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function billEvents(s: EngineState, from: ISODate, to: ISODate): Occurrence[] {
  const lo = from > s.profile.planStart ? from : s.profile.planStart;
  const out = s.commitments.flatMap((c) => occurrences(c, lo, to));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : 1));
}

const sum = (xs: { pence: number }[]) => xs.reduce((a, x) => a + x.pence, 0);

export function expensesBetween(s: EngineState, from: ISODate, to: ISODate): number {
  return s.ledger
    .filter((t) => t.kind === 'expense' && t.date >= from && t.date <= to)
    .reduce((a, t) => a + t.amount.pence, 0);
}

export function balanceAtStartOf(s: EngineState, today: ISODate): number {
  const start = s.profile.planStart;
  const y = addDays(today, -1);
  if (y < start) return openingBalance(s.profile);
  return (
    openingBalance(s.profile) +
    sum(inflowEvents(s, start, y)) -
    sum(billEvents(s, start, y)) -
    expensesBetween(s, start, y)
  );
}

export function protectedHeld(s: EngineState): number {
  return s.profile.minimumReserve.pence + s.profile.savingsGoal.pence;
}

/** Savings that must already be set aside at the end of day t. */
export function savingsHeldOn(s: EngineState, t: ISODate): number {
  const goal = s.profile.savingsGoal.pence;
  if (t >= s.profile.horizonEnd) return goal;
  const due = (s.profile.savingsDeadlines ?? []).filter((x) => x.byDate <= t).reduce((a, x) => a + x.amount.pence, 0);
  return Math.min(goal, due);
}

/** Protected money that must be in the bank at the end of day t (reserve + savings due). */
export function heldOn(s: EngineState, t: ISODate): number {
  return s.profile.minimumReserve.pence + savingsHeldOn(s, t);
}

export function futureInflow(s: EngineState, today: ISODate): number {
  return sum(inflowEvents(s, today, s.profile.horizonEnd));
}
export function futureBills(s: EngineState, today: ISODate): number {
  return sum(billEvents(s, today, s.profile.horizonEnd));
}

export function poolFor(s: EngineState, today: ISODate): number {
  return balanceAtStartOf(s, today) + futureInflow(s, today) - futureBills(s, today) - protectedHeld(s);
}

/** Cap(t) for each day in `days` (consecutive, starting at today). */
export function capSeries(s: EngineState, today: ISODate, days: ISODate[]): number[] {
  const end = days.length ? days[days.length - 1] : today;
  const inflow = new Map<ISODate, number>();
  for (const e of inflowEvents(s, today, end)) inflow.set(e.date, (inflow.get(e.date) ?? 0) + e.pence);
  const bills = new Map<ISODate, number>();
  for (const e of billEvents(s, today, end)) bills.set(e.date, (bills.get(e.date) ?? 0) + e.pence);
  let c = balanceAtStartOf(s, today);
  return days.map((d) => (c += (inflow.get(d) ?? 0) - (bills.get(d) ?? 0)) - heldOn(s, d));
}

/** Expense actuals per (day, category). */
export function actualMap(s: EngineState): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of s.ledger)
    if (t.kind === 'expense') {
      const k = cellKey(t.date, t.category ?? 'other');
      m.set(k, (m.get(k) ?? 0) + t.amount.pence);
    }
  return m;
}

/** Ids of planned purchases completed by a recorded expense (Transaction.plannedPurchaseId). */
export function completedPurchaseIds(s: EngineState): Set<string> {
  const out = new Set<string>();
  for (const t of s.ledger) if (t.kind === 'expense' && t.plannedPurchaseId) out.add(t.plannedPurchaseId);
  return out;
}

/** Outstanding planned purchases (not yet completed by an expense). */
export function outstandingPurchases(s: EngineState) {
  const done = completedPurchaseIds(s);
  return s.plannedPurchases.filter((p) => !done.has(p.id));
}

/** Money still set aside per (day, category): outstanding planned purchases only. */
export function earmarkMap(s: EngineState): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of outstandingPurchases(s)) {
    const k = cellKey(p.date, p.category);
    m.set(k, (m.get(k) ?? 0) + p.amount.pence);
  }
  return m;
}

/** Use of a cell = actuals + outstanding planned purchases. An expense releases a planned
 * purchase only when it is linked to it (plannedPurchaseId), so an unrelated actual in the
 * same cell never hides an earmark. */
export function cellUseMap(s: EngineState): Map<string, number> {
  const a = actualMap(s), e = earmarkMap(s);
  const m = new Map<string, number>();
  for (const k of new Set([...a.keys(), ...e.keys()])) m.set(k, (a.get(k) ?? 0) + (e.get(k) ?? 0));
  return m;
}

export function prefMinMap(s: EngineState): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const p of s.preferences) m.set(p.date, Math.max(m.get(p.date) ?? 0, p.amount.pence));
  return m;
}

/** Stable category order: profile categories first, then other labels alphabetically. */
export function categoryOrder(s: EngineState, extra: Iterable<CategoryId> = []): CategoryId[] {
  const base = s.profile.categories.map((c) => c.id);
  const set = new Set(base);
  const others = [...new Set(extra)].filter((c) => !set.has(c)).sort();
  return [...base, ...others];
}

/** Flexible categories in the order money is taken: non-essentials before essentials,
 * then lowest priority (highest number) first, then profile order. */
export function takeOrder(s: EngineState): CategoryId[] {
  const cats = s.profile.categories.map((c, i) => ({ c, i }));
  cats.sort(
    (a, b) =>
      Number(a.c.essential) - Number(b.c.essential) || b.c.priority - a.c.priority || a.i - b.i,
  );
  return cats.map((x) => x.c.id);
}

export function categoryName(s: EngineState, id: CategoryId): string {
  const c = s.profile.categories.find((x) => x.id === id);
  if (c) return c.name;
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');
}
