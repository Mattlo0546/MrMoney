import {
  actualMap, balanceAtStartOf, billEvents, capSeries, categoryOrder, cellKey, earmarkMap,
  expensesBetween, futureBills, futureInflow, inflowEvents, poolFor, prefMinMap, cellUseMap, savingsHeldOn,
} from './accounting';
import { allocateDayTotals, splitDay } from './allocate';
import { addDays, dateRange, formatShortDate, isISODate } from './dates';
import { formatMoney, gbp, MAX_PENCE } from './money';
import type { Allocation, CategoryId, DeficitItem, EngineState, ISODate, Plan, Summary } from './types';

export class EngineValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super(`Invalid engine state: ${Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  }
}

const okMoney = (m: unknown, allowNeg = false) =>
  typeof m === 'object' && m !== null && (m as { currency: string }).currency === 'GBP' &&
  Number.isSafeInteger((m as { pence: number }).pence) && (allowNeg || (m as { pence: number }).pence >= 0) &&
  Math.abs((m as { pence: number }).pence) <= MAX_PENCE;

/** Field-level validation of the profile and schedule (used by onboarding/settings too). */
export function validateState(s: EngineState): Record<string, string> {
  const e: Record<string, string> = {};
  const p = s.profile;
  if (!okMoney(p.funds)) e.funds = 'Enter an amount in pounds (0 or more).';
  if (p.fundsType !== 'lump' && p.fundsType !== 'monthly') e.fundsType = 'Choose lump sum or monthly allowance.';
  if (p.fundsType === 'monthly' && p.allowanceDay !== undefined && !(Number.isInteger(p.allowanceDay) && p.allowanceDay >= 1 && p.allowanceDay <= 31))
    e.allowanceDay = 'Pick a day between 1 and 31.';
  if (p.openingBalance !== undefined && !okMoney(p.openingBalance)) e.openingBalance = 'Enter an amount in pounds.';
  if (!isISODate(p.planStart)) e.planStart = 'Enter a valid start date.';
  if (!isISODate(p.horizonEnd)) e.horizonEnd = 'Enter a valid end date.';
  else if (isISODate(p.planStart) && p.horizonEnd < p.planStart) e.horizonEnd = 'The end date must be after the start date.';
  if (p.allocationMode !== undefined && p.allocationMode !== 'even' && p.allocationMode !== 'itemised')
    e.allocationMode = 'Choose even or itemised allocation.';
  if (!okMoney(p.minimumReserve)) e.minimumReserve = 'Enter a reserve of 0 or more.';
  if (!okMoney(p.savingsGoal)) e.savingsGoal = 'Enter a savings goal of 0 or more.';
  if (p.savingsDeadlines !== undefined && !(Array.isArray(p.savingsDeadlines) && p.savingsDeadlines.every((x) => okMoney(x.amount) && isISODate(x.byDate))))
    e.savingsDeadlines = 'Savings deadlines need an amount and a valid date.';
  const ids = new Set<string>();
  let wsum = 0;
  if (!Array.isArray(p.categories) || p.categories.length === 0) e.categories = 'Add at least one spending category.';
  else
    for (const c of p.categories) {
      if (!c.id || ids.has(c.id)) e.categories = 'Category ids must be unique.';
      ids.add(c.id);
      if (!(Number.isFinite(c.weight) && c.weight >= 0)) e.categories = 'Category weights must be 0 or more.';
      if (!Number.isInteger(c.priority)) e.categories = 'Category priorities must be whole numbers.';
      if (c.minimumDaily && !okMoney(c.minimumDaily)) e.categories = 'Daily minimums must be 0 or more.';
      wsum += c.weight;
    }
  if (Array.isArray(p.categories) && p.categories.length && !(wsum > 0)) e.categories = 'At least one category needs a weight above 0.';
  s.commitments.forEach((c, i) => {
    if (!okMoney(c.amount)) e[`commitments.${i}.amount`] = 'Enter an amount of 0 or more.';
    const r = c.recurrence;
    if (r.kind === 'once' && !isISODate(r.date)) e[`commitments.${i}.date`] = 'Enter a valid due date.';
    if (r.kind === 'monthly' && !(Number.isInteger(r.dayOfMonth) && r.dayOfMonth >= 1 && r.dayOfMonth <= 31))
      e[`commitments.${i}.dayOfMonth`] = 'Pick a day between 1 and 31.';
  });
  s.incomes.forEach((x, i) => {
    if (!okMoney(x.amount)) e[`incomes.${i}.amount`] = 'Enter an amount of 0 or more.';
    if (!isISODate(x.date)) e[`incomes.${i}.date`] = 'Enter a valid date.';
  });
  return e;
}

export function futureDays(s: EngineState, today: ISODate): ISODate[] {
  return today <= s.profile.horizonEnd ? dateRange(today, s.profile.horizonEnd) : [];
}

/**
 * Full deterministic re-plan of today…horizonEnd. Days before today keep the planned
 * amounts of the previous plan (history is never rewritten). Money already used
 * (actuals, planned purchases) and kept-available amounts are lower bounds.
 */
export function generatePlan(s: EngineState, today: ISODate): Plan {
  const errs = validateState(s);
  if (!isISODate(today)) errs.today = 'Invalid date.';
  else if (isISODate(s.profile.planStart) && today < s.profile.planStart) errs.today = 'Today is before the plan start.';
  if (Object.keys(errs).length) throw new EngineValidationError(errs);

  const W = futureDays(s, today);
  const itemised = s.profile.allocationMode === 'itemised';
  const uses = cellUseMap(s);
  const planned = new Map<string, number>();
  for (const a of s.plan?.allocations ?? []) if (a.day < today) planned.set(cellKey(a.day, a.category), a.planned.pence);

  const usesByDay = new Map<ISODate, Map<CategoryId, number>>();
  // Money used on a day from today on but outside the plan window (after the plan ended):
  // its cell is planned at exactly its use and it comes out of the pool.
  let outside = 0;
  for (const [k, v] of uses) {
    const [d, c] = k.split('|');
    if (d < today) continue;
    if (d > s.profile.horizonEnd) {
      planned.set(k, v);
      outside += v;
      continue;
    }
    if (!usesByDay.has(d)) usesByDay.set(d, new Map());
    usesByDay.get(d)!.set(c, v);
  }
  const hardDay = W.map((d) => [...(usesByDay.get(d)?.values() ?? [])].reduce((a, b) => a + b, 0));
  const hardTotal = hardDay.reduce((a, b) => a + b, 0);
  const P = poolFor(s, today) - outside;
  let gap = 0, unallocated = 0;
  const reasons: string[] = [];
  let totals: number[];

  if (W.length === 0) {
    totals = [];
    unallocated = Math.max(0, P);
    gap = Math.max(0, -P);
    if (unallocated > 0) reasons.push(`The plan ended on ${formatShortDate(s.profile.horizonEnd)}, so ${formatMoney(unallocated)} is not assigned to any day.`);
  } else if (P <= hardTotal) {
    totals = hardDay;
    gap = hardTotal - P;
  } else if (itemised) {
    // Itemised: each day gets exactly what it uses (actuals + planned purchases) plus any
    // kept-available amount; nothing else is spread. The rest stays unallocated as a buffer.
    const caps = capSeries(s, today, W);
    const prefs = prefMinMap(s);
    const lbPref = W.map((d, i) => hardDay[i] + (prefs.get(d) ?? 0));
    let ok = lbPref.reduce((a, b) => a + b, 0) <= P;
    // Kept-available amounts must not spend money before it arrives (I3); uses always may.
    let accP = 0, accU = 0;
    for (let i = 0; ok && i < W.length; i++) {
      accP += lbPref[i];
      accU += hardDay[i];
      if (accP > Math.max(caps[i], accU)) ok = false;
    }
    totals = ok ? lbPref : hardDay;
    if (!ok && prefs.size) reasons.push('Some kept-available amounts could not be honoured with the money available.');
    unallocated = P - totals.reduce((a, b) => a + b, 0);
    if (unallocated > 0)
      reasons.push(`${formatMoney(unallocated)} isn't tied to a specific purchase yet — it stays as your buffer.`);
  } else {
    const caps = capSeries(s, today, W);
    const E = caps.slice();
    for (let i = E.length - 2; i >= 0; i--) E[i] = Math.min(E[i], E[i + 1]);
    let acc = 0;
    const Ep = E.map((e, i) => Math.max(e, (acc += hardDay[i])));
    const prefs = prefMinMap(s);
    const lbPref = W.map((d, i) => hardDay[i] + (prefs.get(d) ?? 0));
    let ok = lbPref.reduce((a, b) => a + b, 0) <= P;
    acc = 0;
    for (let i = 0; ok && i < W.length; i++) if ((acc += lbPref[i]) > Ep[i]) ok = false;
    totals = allocateDayTotals(P, Ep, ok ? lbPref : hardDay);
    if (!ok && prefs.size) reasons.push('Some kept-available amounts could not be honoured with the money available.');
  }

  let essentialShort = 0;
  W.forEach((d, i) => {
    const cats = categoryOrder(s, usesByDay.get(d)?.keys() ?? []);
    const prof = new Map(s.profile.categories.map((c) => [c.id, c]));
    const res = splitDay(
      totals[i],
      cats.map((c) => ({
        weight: prof.get(c)?.weight ?? 0,
        hard: usesByDay.get(d)?.get(c) ?? 0,
        floor: !itemised && prof.get(c)?.essential ? (prof.get(c)?.minimumDaily?.pence ?? 0) : 0,
      })),
    );
    cats.forEach((c, j) => planned.set(cellKey(d, c), res.amounts[j]));
    essentialShort += res.essentialShort;
  });

  return finalizePlan(s, today, planned, gap, unallocated, reasons, essentialShort);
}

/** Build the Plan object (allocations, deficits, summary) from a planned-cell map. */
export function finalizePlan(
  s: EngineState,
  today: ISODate,
  planned: Map<string, number>,
  fundingGap: number,
  unallocated: number,
  unallocatedReasons: string[],
  essentialShort = 0,
): Plan {
  const actuals = actualMap(s);
  const keys = new Set<string>([...planned.keys()]);
  for (const k of actuals.keys()) keys.add(k);
  for (const k of earmarkMap(s).keys()) keys.add(k);
  const byDay = new Map<ISODate, Set<CategoryId>>();
  for (const k of keys) {
    const [d, c] = k.split('|');
    if (!byDay.has(d)) byDay.set(d, new Set());
    byDay.get(d)!.add(c);
  }
  const allocations: Allocation[] = [];
  for (const d of [...byDay.keys()].sort())
    for (const c of categoryOrder(s, byDay.get(d)!))
      if (byDay.get(d)!.has(c)) {
        const k = cellKey(d, c);
        allocations.push({ day: d, category: c, planned: gbp(planned.get(k) ?? 0), actual: gbp(actuals.get(k) ?? 0) });
      }

  const deficits = computeDeficits(s, today, planned, fundingGap, essentialShort);
  const plan: Plan = {
    computedFor: today,
    allocations,
    summary: undefined as unknown as Summary,
    unallocated: gbp(unallocated),
    unallocatedReasons,
    fundingGap: gbp(fundingGap),
    deficits,
  };
  plan.summary = summarize(s, plan, today);
  return plan;
}

function computeDeficits(
  s: EngineState, today: ISODate, planned: Map<string, number>, gap: number, essentialShort: number,
): DeficitItem[] {
  const items: DeficitItem[] = [];
  const reserve = s.profile.minimumReserve.pence;
  const savings = s.profile.savingsGoal.pence;
  if (gap > 0 && savings > 0)
    items.push({
      kind: 'savings-unfunded',
      amount: gbp(Math.min(savings, gap)),
      reason: `Your ${formatMoney(savings)} savings goal can't be funded: bills, your reserve and what you've spent need ${formatMoney(gap)} more than you have.`,
    });
  const W = futureDays(s, today);
  if (W.length) {
    const inflow = new Map<ISODate, number>();
    for (const e of inflowEvents(s, today, W[W.length - 1])) inflow.set(e.date, (inflow.get(e.date) ?? 0) + e.pence);
    const bills = new Map<ISODate, { name: string; pence: number }[]>();
    for (const e of billEvents(s, today, W[W.length - 1])) {
      if (!bills.has(e.date)) bills.set(e.date, []);
      bills.get(e.date)!.push({ name: e.name, pence: e.pence });
    }
    const flexByDay = new Map<ISODate, number>();
    for (const [k, v] of planned) {
      const d = k.slice(0, 10);
      if (d >= today) flexByDay.set(d, (flexByDay.get(d) ?? 0) + v);
    }
    let cash = balanceAtStartOf(s, today);
    let M = 0;
    for (const d of W) {
      // Savings are held by their deadline (or the last day), the reserve from today.
      const savingsBand = gap > 0 ? 0 : savingsHeldOn(s, d);
      const threshold = reserve + savingsBand;
      const dayBills = bills.get(d) ?? [];
      cash += (inflow.get(d) ?? 0) - dayBills.reduce((a, b) => a + b.pence, 0) - (flexByDay.get(d) ?? 0);
      const short = threshold - cash;
      if (short <= M) continue;
      const what = dayBills.length
        ? dayBills.map((b) => `${b.name} (${formatMoney(b.pence)})`).join(' and ')
        : 'Planned spending';
      const bands: [number, number, DeficitItem['kind'], string][] = [
        [0, savingsBand, 'cash-timing', `your savings goal is not fully set aside until money arrives later`],
        [savingsBand, savingsBand + reserve, 'reserve-short', `below your ${formatMoney(reserve)} reserve`],
        [savingsBand + reserve, Infinity, 'bills-short', `short of the cash to pay bills`],
      ];
      for (const [lo, hi, kind, txt] of bands) {
        const part = Math.min(short, hi) - Math.max(M, lo);
        if (part > 0)
          items.push({
            kind, date: d, amount: gbp(part),
            reason: kind === 'cash-timing'
              ? `${what} on ${formatShortDate(d)}: ${txt} (${formatMoney(part)}).`
              : `${what} on ${formatShortDate(d)} leaves you ${formatMoney(part)} ${txt}.`,
          });
      }
      M = short;
    }
  }
  if (essentialShort > 0)
    items.push({
      kind: 'essentials',
      amount: gbp(essentialShort),
      reason: `Essentials need ${formatMoney(essentialShort)} more than this plan can give them.`,
    });
  return items;
}

export function summarize(s: EngineState, plan: Plan, today: ISODate): Summary {
  const end = s.profile.horizonEnd;
  const tomorrow = addDays(today, 1);
  const sod = balanceAtStartOf(s, today);
  const sumE = (from: ISODate, to: ISODate) => inflowEvents(s, from, to).reduce((a, e) => a + e.pence, 0);
  const sumB = (from: ISODate, to: ISODate) => billEvents(s, from, to).reduce((a, e) => a + e.pence, 0);
  const todaySpent = expensesBetween(s, today, today);
  const balance = sod + sumE(today, today) - sumB(today, today) - todaySpent;
  const ear = earmarkMap(s);
  const uses = cellUseMap(s);
  let flex = 0, earmarked = 0, tAllow = 0, tRem = 0;
  for (const a of plan.allocations) {
    if (a.day < today) continue;
    const k = cellKey(a.day, a.category);
    flex += a.planned.pence - a.actual.pence;
    earmarked += ear.get(k) ?? 0;
    if (a.day === today) {
      tAllow += a.planned.pence;
      tRem += a.planned.pence - (uses.get(k) ?? 0);
    }
  }
  const gap = plan.fundingGap.pence;
  return {
    balance: gbp(Math.max(0, balance)), // an overdraft shows as a bills-short deficit instead
    reservedForCommitments: gbp(tomorrow <= end ? sumB(tomorrow, end) : 0),
    reserve: s.profile.minimumReserve,
    plannedSavings: gbp(s.profile.savingsGoal.pence - Math.min(s.profile.savingsGoal.pence, gap)),
    flexibleRemaining: gbp(Math.max(0, flex)),
    earmarked: gbp(earmarked),
    todayAllowance: gbp(tAllow),
    todayRemaining: gbp(Math.max(0, tRem)),
    todaySpent: gbp(todaySpent),
    futureIncome: gbp(tomorrow <= end ? sumE(tomorrow, end) : 0),
  };
}

/** Totals used by invariant I1. */
export function accountingTotals(s: EngineState, today: ISODate) {
  return {
    balanceSOD: balanceAtStartOf(s, today),
    inflow: futureInflow(s, today),
    bills: futureBills(s, today),
    reserve: s.profile.minimumReserve.pence,
    savings: s.profile.savingsGoal.pence,
  };
}
