/**
 * Pure: "I want to buy a basketball" -> a re-planned itemised calendar. Treats in the run-up get swapped for the
 * cheapest meal already on the plan (coffee dropped), any remainder is set aside a little each day, and the item
 * lands on the goal day. The result replaces the itinerary as a set, so the engine checks every penny and the
 * calendar shows (and animates) each day that changed.
 */
import { addDays, dateRange, formatMoney, gbp } from '@/lib/engine';
import type { ISODate, ItemRef, PlannedPurchase, PurchaseLine } from '@/lib/engine';

export interface GoalInput {
  label: string;
  amountPence: number;
  category: string;
  /** The day to buy it. Default: DEFAULT_GOAL_DAYS from today. */
  byDate?: ISODate;
}

export interface GoalDayChange {
  date: ISODate;
  /** Positive = cheaper than before (treats cut or money set aside). */
  savedPence: number;
  what: string;
}

export interface GoalPlan {
  purchases: PlannedPurchase[];
  date: ISODate;
  /** Freed by swapping treats for cheaper meals. */
  cutPence: number;
  /** Set aside a little each day (what the cuts did not cover). */
  setAsidePence: number;
  perDaySetAsidePence: number;
  changes: GoalDayChange[];
}

export const DEFAULT_GOAL_DAYS = 14;

const slotOf = (l: PurchaseLine) => /^(\w+):/.exec(l.name)?.[1];
const FUND = 'fund';

export function planGoalPurchase(current: PlannedPurchase[], goal: GoalInput, today: ISODate, horizonEnd: ISODate): GoalPlan | { error: string } {
  const date = goal.byDate ?? addDays(today, DEFAULT_GOAL_DAYS);
  if (date <= today) return { error: 'Pick a day after today to buy it.' };
  if (date > horizonEnd) return { error: `Pick a day on or before ${horizonEnd}, when your plan ends.` };
  const itin = current.filter((p) => p.source === 'itinerary');
  // Re-running a goal for the same thing replaces it rather than stacking.
  const goalId = `itin-goal-${goal.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  const base = itin.filter((p) => p.id !== goalId).map((p) => ({ ...p, lines: p.lines?.filter((l) => l.ref?.id !== `${FUND}-${goalId}`) }))
    .map((p) => (p.lines ? { ...p, amount: gbp(p.lines.reduce((t, l) => t + l.pence, 0)) } : p));

  // The cheapest Lunch/Dinner line on the plan is the swap target (real item, real source).
  let cheapest: PurchaseLine | undefined;
  for (const p of base) for (const l of p.lines ?? []) {
    const s = slotOf(l);
    if ((s === 'Lunch' || s === 'Dinner') && (!cheapest || l.pence < cheapest.pence)) cheapest = l;
  }
  const swapTo = (slot: string): PurchaseLine | undefined =>
    cheapest && { ...cheapest, name: `${slot}:${cheapest.name.slice(cheapest.name.indexOf(':') + 1)}`, note: 'Swapped to save for your goal' };

  const window = new Set(dateRange(addDays(today, 1), date));
  const byId = new Map(base.map((p) => [p.id, p]));
  const changes = new Map<ISODate, GoalDayChange>();
  let cut = 0;
  // Cut treats day by day from tomorrow until the goal is covered.
  for (const p of [...base].sort((a, b) => a.date.localeCompare(b.date))) {
    if (cut >= goal.amountPence) break;
    if (!window.has(p.date) || !p.lines?.length) continue;
    const lines: PurchaseLine[] = [];
    for (const l of p.lines) {
      const s = slotOf(l);
      if (s === 'Coffee') continue;
      const to = (s === 'Lunch' || s === 'Dinner') && cheapest && l.pence > cheapest.pence ? swapTo(s) : undefined;
      lines.push(to ?? l);
    }
    const amount = lines.reduce((t, l) => t + l.pence, 0);
    const saved = p.amount.pence - amount;
    if (saved <= 0) continue;
    cut += saved;
    byId.set(p.id, { ...p, lines, amount: gbp(amount), label: 'Saving mode', reason: `Treats swapped to save for ${goal.label}` });
    changes.set(p.date, { date: p.date, savedPence: saved, what: 'treats swapped for cheaper meals' });
  }

  // Whatever the cuts don't cover is set aside evenly, a little each day.
  const rest = Math.max(0, goal.amountPence - cut);
  // Up to and including the goal day, so the goal day itself changes too.
  const fundDays = [...window];
  const each = fundDays.length ? Math.floor(rest / fundDays.length) : 0;
  let left = rest - each * fundDays.length;
  const fundRef: ItemRef = { id: `${FUND}-${goalId}`, origin: 'catalogue', merchant: 'You', item: `${goal.label} fund`, sourceUrl: '', checked: today };
  if (rest > 0) {
    const onDay = new Map<ISODate, PlannedPurchase>();
    for (const p of byId.values()) if (window.has(p.date) && !onDay.has(p.date)) onDay.set(p.date, p);
    for (const d of fundDays) {
      const pence = each + (left-- > 0 ? 1 : 0);
      if (pence <= 0) continue;
      const line: PurchaseLine = { name: `Set aside for ${goal.label}`, qty: '1', pence, ref: { ...fundRef, pricePence: pence } };
      const p = onDay.get(d);
      if (p) {
        const lines = [...(p.lines ?? [{ name: p.label, qty: '1', pence: p.amount.pence, ref: p.ref ?? { ...fundRef, id: `${p.id}-ref`, item: p.label } }]), line];
        byId.set(p.id, { ...p, lines, amount: gbp(p.amount.pence + pence) });
      } else {
        const id = `itin-fund-${goalId}-${d}`;
        byId.set(id, { id, date: d, category: goal.category, amount: gbp(pence), label: `${goal.label} fund`, lines: [line], source: 'itinerary' });
      }
      const c = changes.get(d);
      changes.set(d, { date: d, savedPence: (c?.savedPence ?? 0) + pence, what: c ? `${c.what} + ${goal.label} fund` : `${goal.label} fund` });
    }
  }

  // The goal itself: paid from what was cut (the set-aside money was already counted on each day).
  const payNow = goal.amountPence - rest;
  const goalLine: PurchaseLine = {
    name: goal.label, qty: '1', pence: payNow, ref: { id: goalId, origin: 'catalogue', merchant: 'You', item: goal.label, pricePence: goal.amountPence, sourceUrl: '', checked: today },
    ...(rest > 0 ? { note: `${formatMoney(rest)} of it comes from your daily set-asides` } : {}),
  };
  byId.set(goalId, {
    id: goalId, date, category: goal.category, amount: gbp(payNow), label: `🎯 ${goal.label}`, lines: [goalLine], source: 'itinerary',
    reason: 'Your goal',
  });
  changes.set(date, { date, savedPence: changes.get(date)?.savedPence ?? 0, what: `buy ${goal.label}` });

  return {
    purchases: [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    date, cutPence: cut, setAsidePence: rest, perDaySetAsidePence: each,
    changes: [...changes.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
