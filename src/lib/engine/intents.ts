import { categoryName, cellKey, outstandingPurchases, poolFor, takeOrder } from './accounting';
import { addDays, endOfMonth, formatDayRange, formatShortDate, isISODate } from './dates';
import { computeDiff } from './diff';
import { explain } from './explain';
import { cashViolations } from './invariants';
import { evenSplitLatest, formatMoney, gbp, isMoney, largestRemainder as largestRemainderLocal, MAX_PENCE } from './money';
import { finalizePlan, futureDays, generatePlan, validateState } from './plan';
import { amountOn, occurrences } from './recurrence';
import type {
  ApplyResult, BorrowSource, Borrowing, CategoryId, ChangeSet, Clarification, Commitment, EngineError, EngineState,
  Explanation, HypotheticalIntent, ISODate, Intent, Plan, PlannedPurchase,
} from './types';
import {
  addEven, cellFree, cellUse, dayAvailable, dayRemaining, daysAfter, getP, intraDayTake, isEssential, makeWork,
  movesBetween, reallocDays, refresh, repairCash, setP, takeEven, type Work,
} from './work';

const clone = <T>(x: T): T => structuredClone(x);

/** D16: a planned purchase may borrow from the non-essential categories of the following
 * BORROW_WINDOW_DAYS days, at most BORROW_MAX_SHARE of each later day's unused amount per
 * category (lowest priority first). Essentials and protected money are never borrowed. */
export const BORROW_WINDOW_DAYS = 7;
export const BORROW_MAX_SHARE = 0.5;

/** Returns a state whose plan is computed for `today` (rolls the plan forward on a new day).
 * Rolling forward keeps every future day's planned amounts (so earlier reallocations and
 * trade-offs survive) and spreads money left over from past days evenly over today…end.
 * It falls back to a full re-plan when that is not possible (funding gap, plan ended,
 * cash constraint, or a day planned below what it already uses). */
export function ensurePlan(state: EngineState, today: ISODate): EngineState {
  if (state.plan && state.plan.computedFor === today) return state;
  const next = clone(state);
  next.plan = rollForward(next, today) ?? generatePlan(next, today);
  return next;
}

function rollForward(s: EngineState, today: ISODate): Plan | null {
  const prev = s.plan;
  if (!prev || !isISODate(today) || prev.computedFor > today) return null;
  if (Object.keys(validateState(s)).length || today < s.profile.planStart) return null;
  if (prev.fundingGap.pence > 0 || prev.unallocated.pence > 0) return null;
  const W = futureDays(s, today);
  if (!W.length) return null;
  const w = makeWork(s, today);
  let kept = 0;
  for (const [k, v] of w.planned) if (k.slice(0, 10) >= today) kept += v;
  const delta = poolFor(s, today) - kept;
  if (delta < 0) return null;
  if (delta > 0) addEven(w, delta, W);
  for (const [k, v] of w.uses) if (k.slice(0, 10) >= today && (w.planned.get(k) ?? 0) < v) return null;
  for (const d of W) if (dayRemaining(w, d) < (w.prefs.get(d) ?? 0)) return null;
  if (cashViolations(s, today, w.planned).length) return null;
  return finalizePlan(s, today, w.planned, 0, 0, []);
}

type Fail = { ok: false; error: EngineError } | { ok: false; needsClarification: Clarification };
const err = (code: EngineError['code'], message: string, details?: unknown): Fail => ({ ok: false, error: { code, message, details } });
const ask = (field: string, question: string): Fail => ({ ok: false, needsClarification: { field, question } });

function checkAmount(m: unknown, field = 'amount'): Fail | null {
  if (typeof m === 'object' && m !== null && (m as { currency?: string }).currency && (m as { currency: string }).currency !== 'GBP')
    return ask(field, `That amount isn't in pounds. How much is it in GBP?`);
  if (typeof m === 'object' && m !== null && typeof (m as { pence?: unknown }).pence === 'number' && Math.abs((m as { pence: number }).pence) > MAX_PENCE)
    return err('out-of-range', `That amount is too large. The most StudentPlan handles is ${formatMoney(MAX_PENCE)}.`);
  if (!isMoney(m)) return ask(field, 'How much was it, in pounds?');
  if (m.pence <= 0) return ask(field, 'The amount needs to be more than £0. How much was it?');
  return null;
}
function checkDate(d: unknown, field = 'date'): Fail | null {
  return isISODate(d) ? null : ask(field, 'Which day was that?');
}

interface Outcome {
  extras?: Parameters<typeof computeDiff>[4];
  /** Use a full re-plan instead of the working grid. */
  replan?: boolean;
  /** Expense on today: the free part of its own cell before it was recorded. */
  ownFree?: number;
}
type Handler = (w: Work, today: ISODate) => Outcome | Fail;

function runHandler(base: EngineState, intent: Intent, today: ISODate, handler: Handler): ApplyResult {
  const next = clone(base);
  const w = makeWork(next, today);
  const out = handler(w, today);
  if ('ok' in out) return out;
  next.processedKeys.push(intent.idempotencyKey);
  let replanned = !!out.replan;
  if (!replanned) {
    refresh(w);
    // Fallback 1: repair cash timing on the working grid (today kept, take order, floors).
    if (cashViolations(next, today, w.planned).length && !repairCash(w)) replanned = true;
  }
  // Fallback 2 (last resort): a full deterministic re-plan.
  next.plan = replanned ? generatePlan(next, today) : finalizePlan(next, today, w.planned, w.gap, w.unallocated, w.reasons);
  const diff = computeDiff(base, next, intent, today, { ...out.extras, replanned });
  if (replanned && intent.kind === 'expense') reconcileExpense(diff, intent.date === today, out.ownFree ?? 0);
  return { ok: true, nextState: next, diff, explanationFacts: explain(diff) };
}

/** After a full re-plan the incremental split of an expense no longer describes the plan:
 * recompute it from the final diff so the explanation matches what actually moved. */
function reconcileExpense(d: ChangeSet, sameDay: boolean, ownFree: number) {
  const sum = (xs: ChangeSet['sources']) => xs.reduce((a, x) => a + x.amount.pence, 0);
  const amount = d.amount!.pence;
  const fromUnalloc = d.fromUnallocated?.pence ?? 0;
  const own = sameDay ? ownFree : 0;
  const absorbed = Math.min(amount, sameDay ? own + Math.max(0, sum(d.sameDaySources) - sum(d.sameDayAdditions)) : 0);
  const later = Math.min(amount - absorbed - fromUnalloc, Math.max(0, sum(d.sources) - sum(d.additions)));
  d.absorbed = gbp(absorbed);
  d.overspend = gbp(amount - absorbed);
  d.takenFromLater = gbp(later);
  d.uncovered = gbp(amount - absorbed - later - fromUnalloc);
}

function noop(base: EngineState, intent: Intent, today: ISODate): ApplyResult {
  const diff: ChangeSet = { ...computeDiff(base, base, intent, today), noop: true };
  return { ok: true, nextState: base, diff, explanationFacts: explain(diff) };
}

// ---------------------------------------------------------------------------

export function applyIntent(state: EngineState, intent: Intent, today: ISODate): ApplyResult {
  if (!isISODate(today)) return err('invalid', 'Invalid date for today.');
  if (!intent || typeof intent !== 'object' || typeof intent.idempotencyKey !== 'string' || !intent.idempotencyKey)
    return err('invalid', 'Intent needs an idempotency key.');
  let base: EngineState;
  try {
    base = ensurePlan(state, today);
  } catch (e) {
    return err('invalid', (e as Error).message);
  }
  if (base.processedKeys.includes(intent.idempotencyKey) ||
      base.ledger.some((t) => t.idempotencyKey === intent.idempotencyKey))
    return noop(base, intent, today);
  const p = base.profile;
  switch (intent.kind) {
    case 'expense': {
      const bad = checkAmount(intent.amount) ?? checkDate(intent.date);
      if (bad) return bad;
      if (!intent.category) return ask('category', 'What was it for?');
      if (intent.date > today) return ask('date', 'That date is in the future. Is it a planned purchase (ask "Can I spend…")?');
      if (intent.date < p.planStart) return err('out-of-range', 'That date is before your plan started.');
      let link: PlannedPurchase | undefined;
      if (intent.plannedPurchaseId !== undefined) {
        link = outstandingPurchases(base).find((x) => x.id === intent.plannedPurchaseId);
        if (!link) return err('not-found', 'That planned purchase is not open any more.');
      } else link = matchPurchase(base, intent.date, intent.category, intent.note);
      return runHandler(base, intent, today, (w) => expense(w, intent.date, intent.category, intent.amount.pence, intent, link));
    }
    case 'hypothetical':
      return hypothetical(base, intent, today);
    case 'income': {
      const bad = checkAmount(intent.amount) ?? checkDate(intent.date);
      if (bad) return bad;
      if (intent.date < p.planStart) return err('out-of-range', 'That date is before your plan started.');
      return runHandler(base, intent, today, (w) => {
        const key = intent.idempotencyKey;
        if (intent.date <= today)
          w.s.ledger.push({ id: `tx-${key}`, idempotencyKey: key, date: intent.date, amount: intent.amount, kind: 'income', note: intent.note });
        else
          w.s.incomes.push({ id: `inc-${key}`, amount: intent.amount, date: intent.date, source: 'other', confirmed: true, note: intent.note });
        refresh(w);
        if (w.gap > 0) return { replan: true, extras: { amount: intent.amount } };
        const days = reallocDays(w).filter((d) => d >= intent.date);
        // Income dated after the plan's last day is recorded but does not fund this plan.
        if (days.length) addEven(w, intent.amount.pence, days);
        return { extras: { amount: intent.amount } };
      });
    }
    case 'commitmentChange':
      return commitmentChange(base, intent, today);
    case 'preference': {
      const bad = checkAmount(intent.amount) ?? checkDate(intent.date);
      if (bad) return bad;
      if (intent.date < today || intent.date > p.horizonEnd) return err('out-of-range', 'Pick a day between today and the end of your plan.');
      return runHandler(base, intent, today, (w) => {
        const d = intent.date;
        w.s.preferences = w.s.preferences.filter((x) => x.date !== d);
        const before = dayRemaining(w, d);
        if (before < intent.amount.pence) {
          const need = intent.amount.pence - before;
          const moved = moveIntoDay(w, d, need, null);
          if (moved < need)
            return err('insufficient-flexible', `There isn't ${formatMoney(need)} of flexible money to move to ${formatShortDate(d)}.`);
        }
        w.s.preferences.push({ id: `pref-${intent.idempotencyKey}`, kind: 'keepAvailable', date: d, amount: intent.amount, label: intent.label });
        refresh(w);
        const after = dayRemaining(w, d);
        if (cashViolations(w.s, today, w.planned).length)
          return err('cash-constraint', `Keeping ${formatMoney(intent.amount)} on ${formatShortDate(d)} would spend money before it arrives.`);
        return { extras: { amount: intent.amount, dayRemainingBefore: gbp(before), dayRemainingAfter: gbp(after), target: { day: d, category: '', categoryName: '' } } };
      });
    }
    case 'goal': {
      const bad = checkAmount(intent.amount) ?? (intent.byDate !== undefined ? checkDate(intent.byDate, 'byDate') : null);
      if (bad) return bad;
      if (intent.byDate !== undefined && intent.byDate <= today)
        return err('out-of-range', 'Pick a date after today to save by.');
      // A deadline on or after the plan's last day is the same as no deadline.
      const deadline = intent.byDate !== undefined && intent.byDate < p.horizonEnd ? intent.byDate : undefined;
      return runHandler(base, intent, today, (w) => {
        const beforeGoal = w.s.profile.savingsGoal;
        w.s.profile.savingsGoal = gbp(beforeGoal.pence + intent.amount.pence);
        if (deadline)
          w.s.profile.savingsDeadlines = [...(w.s.profile.savingsDeadlines ?? []), { amount: intent.amount, byDate: deadline }];
        const days = reallocDays(w).filter((d) => d > w.today && (!deadline || d <= deadline));
        const taken = takeEven(w, takeOrder(w.s), days, intent.amount.pence, true);
        if (taken < intent.amount.pence)
          return err('insufficient-flexible', `Only ${formatMoney(taken)} of flexible money is available to save${deadline ? ` by ${formatShortDate(deadline)}` : ''}.`);
        return { extras: { amount: intent.amount, savingsGoal: { before: beforeGoal, after: w.s.profile.savingsGoal, byDate: deadline } } };
      });
    }
    case 'settingsEdit': {
      if (!intent.patch || typeof intent.patch !== 'object') return err('invalid', 'Nothing to change.');
      const unknown = Object.keys(intent.patch).filter((k) => !SETTINGS_KEYS.includes(k as (typeof SETTINGS_KEYS)[number]));
      if (unknown.length) return err('invalid', `These settings can't be changed here: ${unknown.join(', ')}.`, { fields: unknown });
      const patched = clone(base);
      Object.assign(patched.profile, clone(intent.patch));
      const errs = validateState(patched);
      if (intent.patch.horizonEnd && intent.patch.horizonEnd < today) errs.horizonEnd = 'The end date must be today or later.';
      if (Object.keys(errs).length) return err('invalid', Object.values(errs)[0], errs);
      const newEnd = intent.patch.horizonEnd;
      if (newEnd) {
        const late = outstandingPurchases(base).find((x) => x.date > newEnd);
        if (late)
          return err('invalid', `You have ${late.label} (${formatMoney(late.amount)}) planned on ${formatShortDate(late.date)}, after that end date. Remove it first.`, { plannedPurchaseId: late.id });
      }
      return runHandler(base, intent, today, (w) => {
        Object.assign(w.s.profile, clone(intent.patch));
        // Kept-available amounts after a shortened end date no longer apply.
        if (newEnd) w.s.preferences = w.s.preferences.filter((x) => x.date <= newEnd);
        return {
          replan: true,
          extras: intent.patch.savingsGoal ? { savingsGoal: { before: base.profile.savingsGoal, after: intent.patch.savingsGoal } } : {},
        };
      });
    }
    case 'removePlannedPurchase':
      return removePlannedPurchase(base, intent, today);
    default:
      return err('invalid', `Unknown intent kind.`);
  }
}

const SETTINGS_KEYS = ['minimumReserve', 'savingsGoal', 'horizonEnd', 'categories', 'funds', 'fundsType'] as const;

/** Auto-link an expense to an outstanding planned purchase on the same day: same category
 * first, then a purchase whose label equals the expense category or note. */
function matchPurchase(s: EngineState, date: ISODate, cat: CategoryId, note?: string): PlannedPurchase | undefined {
  const open = outstandingPurchases(s).filter((x) => x.date === date);
  const norm = (x: string) => x.trim().toLowerCase().replace(/[-_]/g, ' ');
  return (
    open.find((x) => x.category === cat) ??
    open.find((x) => norm(x.label) === norm(cat) || (!!note && norm(x.label) === norm(note)))
  );
}

function removePlannedPurchase(base: EngineState, intent: Extract<Intent, { kind: 'removePlannedPurchase' }>, today: ISODate): ApplyResult {
  const all = base.plannedPurchases.filter((x) => x.date >= today);
  let pp: PlannedPurchase | undefined;
  if (intent.plannedPurchaseId) {
    pp = base.plannedPurchases.find((x) => x.id === intent.plannedPurchaseId);
    if (!pp) return err('not-found', 'That planned purchase does not exist.');
    if (pp.date < today) return err('out-of-range', 'That day has passed.');
  } else {
    const label = intent.label?.trim().toLowerCase();
    const hits = all.filter((x) => (!label || x.label.toLowerCase().includes(label)) && (!intent.date || x.date === intent.date));
    if (!hits.length) return all.length ? ask('target', `Which planned purchase? You have ${all.map((x) => `${x.label} (${formatShortDate(x.date)})`).join(', ')}.`) : err('not-found', 'You have no planned purchases.');
    if (hits.length > 1) return ask('target', `Which one: ${hits.map((x) => `${x.label} (${formatShortDate(x.date)})`).join(' or ')}?`);
    pp = hits[0];
  }
  const target = pp;
  return runHandler(base, intent, today, (w) => {
    w.s.plannedPurchases = w.s.plannedPurchases.filter((x) => x.id !== target.id);
    refresh(w);
    const d = target.date, c = target.category;
    // A purchase in a non-spending category held its own cell: give that money back to the
    // day's spending categories by weight.
    if (!w.s.profile.categories.some((x) => x.id === c)) {
      const free = Math.max(0, getP(w, d, c) - cellUse(w, d, c));
      if (free > 0) { setP(w, d, c, getP(w, d, c) - free); addEven(w, free, [d]); }
    }
    return {
      extras: {
        amount: target.amount,
        target: { day: d, category: c, categoryName: categoryName(w.s, c), label: target.label },
        removedPurchase: target,
      },
    };
  });
}

/** Same computation as applyIntent; never mutates its input and commits nothing. */
export function previewIntent(state: EngineState, intent: Intent, today: ISODate): ApplyResult & { affordability?: Affordability } {
  const res = applyIntent(state, intent, today);
  if (intent.kind === 'hypothetical' && (res.ok || res.error?.code === 'shortfall')) {
    const aff = affordability(state, intent, today);
    return { ...res, affordability: 'fits' in aff ? aff : undefined };
  }
  return res;
}

// --------------------------- expense --------------------------------------

function expense(w: Work, date: ISODate, cat: CategoryId, amount: number, intent: Intent, link?: PlannedPurchase): Outcome {
  const key = intent.idempotencyKey;
  const note = intent.kind === 'expense' ? intent.note : undefined;
  w.s.ledger.push({
    id: `tx-${key}`, idempotencyKey: key, date, amount: gbp(amount), kind: 'expense', category: cat, note,
    ...(link ? { plannedPurchaseId: link.id } : {}),
  });
  refresh(w);
  // A completed planned purchase in another cell releases its earmark: use that money first.
  const fromReleased = (d: ISODate, need: number) => {
    if (!link || link.date !== d || link.category === cat || d < w.today || need <= 0) return 0;
    const x = Math.min(need, cellFree(w, d, link.category, true));
    if (x > 0) setP(w, d, link.category, getP(w, d, link.category) - x);
    return x;
  };
  let overspend: number;
  let ownFree = 0;
  if (date === w.today) {
    ownFree = Math.max(0, getP(w, date, cat) - (w.uses.get(cellKey(date, cat)) ?? 0) + amount);
    const newUse = w.uses.get(cellKey(date, cat)) ?? 0;
    const old = getP(w, date, cat);
    const need = Math.max(0, newUse - old);
    // Money spent today is covered by today's whole remaining allowance first: same
    // category, then the day's other categories (lowest priority first). Essential floors
    // limit reallocation from other days, not how today's own spending is counted.
    let fromDay = fromReleased(date, need);
    fromDay += intraDayTake(w, date, cat, need - fromDay, 'any');
    setP(w, date, cat, old + fromDay);
    overspend = need - fromDay;
  } else {
    overspend = amount; // history keeps its plan; the money now comes out of future days
  }
  let taken = 0, fromUnallocated = 0;
  if (overspend > 0) {
    if (link && link.date !== date) taken += fromReleased(link.date, overspend);
    const days = reallocDays(w).filter((d) => !(date === w.today && d === date));
    // Automatic reallocation respects essential floors; what cannot be covered becomes a gap.
    taken += takeEven(w, takeOrder(w.s), days, overspend - taken, true);
    if (taken < overspend && w.unallocated > 0) {
      fromUnallocated = Math.min(w.unallocated, overspend - taken);
      w.unallocated -= fromUnallocated;
    }
    if (date === w.today) setP(w, date, cat, getP(w, date, cat) + overspend);
    w.gap += overspend - taken - fromUnallocated;
  }
  return {
    ownFree: Math.min(ownFree, amount),
    extras: {
      amount: gbp(amount),
      target: { day: date, category: cat, categoryName: categoryName(w.s, cat) },
      absorbed: gbp(Math.max(0, amount - overspend)),
      overspend: gbp(overspend),
      takenFromLater: gbp(taken),
      ...(fromUnallocated > 0 ? { fromUnallocated: gbp(fromUnallocated) } : {}),
      uncovered: gbp(overspend - taken - fromUnallocated),
    },
  };
}

// --------------------------- moves into a day -----------------------------

/** Move `need` of flexible money into day d (into category `into`, or by weight if null),
 * from the lowest-priority non-essential category on the days after d to the end of
 * that month (extended to the end of the plan if needed). Returns the amount moved. */
function moveIntoDay(w: Work, d: ISODate, need: number, into: CategoryId | null): number {
  let moved = 0;
  for (const c of nonEssentialOrder(w)) {
    if (moved >= need) break;
    for (const days of [daysAfter(w, d, endOfMonth(d)), daysAfter(w, d)]) {
      moved += takeEven(w, [c], days, need - moved, true);
      if (moved >= need) break;
    }
  }
  if (moved > 0) depositInto(w, d, moved, into);
  return moved;
}

function depositInto(w: Work, d: ISODate, amount: number, into: CategoryId | null) {
  if (into) setP(w, d, into, getP(w, d, into) + amount);
  else addEven(w, amount, [d]);
}

const nonEssentialOrder = (w: Work) => takeOrder(w.s).filter((c) => !isEssential(w, c));

// --------------------------- hypothetical / affordability -----------------

export interface TradeoffOption {
  id: string;
  title: string;
  /** Flexible money this option moves into the request day, by source category (sums to
   * the shortfall). Money borrowed from the following week comes on top: see `borrowed`. */
  sources: { category: CategoryId; categoryName: string; amount: number; from: ISODate; to: ISODate; days: number }[];
  /** Pence borrowed from the following days' non-essentials before this option applies. */
  borrowed?: number;
  preview: { nextState: EngineState; diff: ChangeSet; explanation: Explanation };
}

type Preview = { nextState: EngineState; diff: ChangeSet; explanation: Explanation };

/**
 * `dayRemaining`: what the day can give this purchase without touching essentials (same
 *   as `dayAvailable`; kept for compatibility). `dayRemainingTotal`: the day's whole unused
 *   allowance, essentials included. shortfall = amount − dayRemaining − borrowable.
 * `dayAvailable`: what the day can give this purchase without touching essentials.
 * `borrowed` / `borrowable`: pence from the following BORROW_WINDOW_DAYS days' non-essentials.
 * `message`: one plain sentence, e.g. "Fits — £8.64 comes from shopping over 12–18 Nov".
 */
export type Affordability =
  | {
      fits: true; amount: number; dayRemaining: number; remainingAfter: number; preview: Preview;
      dayAvailable?: number; dayRemainingTotal?: number; borrowed?: number; borrowing?: Borrowing; message?: string; alreadyApplied?: boolean;
    }
  | {
      fits: false; amount: number; dayRemaining: number; shortfall: number; options: TradeoffOption[];
      dayAvailable?: number; dayRemainingTotal?: number; borrowable?: number; borrowing?: Borrowing; message?: string;
    };

interface RequestLike { amount: HypotheticalIntent['amount']; date: ISODate; category: CategoryId; label?: string; idempotencyKey?: string }

function validateRequest(base: EngineState, r: RequestLike, today: ISODate): Fail | null {
  const bad = checkAmount(r.amount) ?? checkDate(r.date);
  if (bad) return bad;
  if (!r.category) return ask('category', 'What is it for?');
  if (r.date < today) return err('out-of-range', 'That day has passed. Did you mean to record an expense?');
  if (r.date > base.profile.horizonEnd) return err('out-of-range', 'That day is after the end of your plan.');
  return null;
}

/** Days a purchase on d may borrow from: d+1 … d+BORROW_WINDOW_DAYS within the plan. */
export function borrowWindow(w: Work, d: ISODate): ISODate[] {
  return daysAfter(w, d, addDays(d, BORROW_WINDOW_DAYS));
}

/** Borrow up to `need` from the window's non-essential cells, lowest priority first, evenly
 * over the days, never more than BORROW_MAX_SHARE of a cell's unused amount (measured
 * before this borrow), never below kept-available amounts. Returns the amount moved out. */
function borrowWeek(w: Work, d: ISODate, need: number): number {
  const days = borrowWindow(w, d);
  let got = 0;
  for (const c of nonEssentialOrder(w)) {
    if (got >= need) break;
    const lim = new Map<ISODate, number>();
    for (const x of days)
      lim.set(x, Math.floor(Math.min(cellFree(w, x, c, true), Math.max(0, dayRemaining(w, x) - (w.prefs.get(x) ?? 0))) * BORROW_MAX_SHARE));
    let active = days.filter((x) => lim.get(x)! > 0);
    while (got < need && active.length) {
      const parts = evenSplitLatest(need - got, active.length);
      const next: ISODate[] = [];
      let took = 0;
      active.forEach((x, i) => {
        const y = Math.min(lim.get(x)!, parts[i]);
        if (y > 0) { setP(w, x, c, getP(w, x, c) - y); lim.set(x, lim.get(x)! - y); took += y; }
        if (lim.get(x)! > 0) next.push(x);
      });
      got += took;
      if (took === 0) break;
      active = next;
    }
  }
  return got;
}

function toSources(w: Work, moves: ReturnType<typeof movesBetween>): BorrowSource[] {
  return moves.map((m) => ({
    category: m.category, categoryName: categoryName(w.s, m.category), amount: gbp(m.amount),
    from: m.days[0], to: m.days[m.days.length - 1], days: m.days,
  }));
}

function toBorrowing(w: Work, sources: BorrowSource[]): Borrowing | undefined {
  if (!sources.length) return undefined;
  // Listed in the order the money was taken (lowest priority first).
  const order = nonEssentialOrder(w);
  sources = [...sources].sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category));
  const days = sources.flatMap((x) => x.days).sort();
  return { amount: gbp(sources.reduce((a, x) => a + x.amount.pence, 0)), from: days[0], to: days[days.length - 1], sources };
}

/** "shopping" / "shopping (£18.03) and eating out (£19.25)" */
function borrowWhat(b: Borrowing): string {
  if (b.sources.length === 1) return b.sources[0].categoryName.toLowerCase();
  const xs = b.sources.map((x) => `${x.categoryName.toLowerCase()} (${formatMoney(x.amount)})`);
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

type Strategy = { id: string; title: string; run: (w: Work, d: ISODate, need: number) => number };

function strategies(w: Work, d: ISODate): Strategy[] {
  const ne = nonEssentialOrder(w);
  const out: Strategy[] = [];
  const range = (days: ISODate[]) => (days.length ? `${formatShortDate(days[0])} – ${formatShortDate(days[days.length - 1])}` : '');
  if (ne[0]) {
    const c = ne[0];
    out.push({
      id: `${c}-later`,
      title: `${categoryName(w.s, c)}, ${range(daysAfter(w, d, endOfMonth(d)))}`,
      run: (w2, d2, need) => {
        const m = takeEven(w2, [c], daysAfter(w2, d2, endOfMonth(d2)), need, true);
        return m + (m < need ? takeEven(w2, [c], daysAfter(w2, d2), need - m, true) : 0);
      },
    });
  }
  if (ne[1]) {
    const c = ne[1];
    const days = daysAfter(w, d).slice(0, 14);
    out.push({
      id: `${c}-two-weeks`,
      title: `${categoryName(w.s, c)}, ${range(days)}`,
      run: (w2, d2, need) => takeEven(w2, [c], daysAfter(w2, d2).slice(0, 14), need, true),
    });
  }
  out.push({
    id: 'all-flexible-rest',
    title: `All flexible spending, ${range(daysAfter(w, d))}`,
    run: (w2, d2, need) => spreadAllFlexible(w2, daysAfter(w2, d2), need),
  });
  // Days between tomorrow and the day before the request (useful for late requests).
  const before = (w2: Work, d2: ISODate) => futureDays(w2.s, w2.today).filter((x) => x > w2.today && x < d2);
  if (ne.length && before(w, d).length) {
    const names = ne.map((c) => categoryName(w.s, c));
    out.push({
      id: 'earlier-days',
      title: `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1].toLowerCase()}` : names[0]}, ${range(before(w, d))}`,
      run: (w2, d2, need) => takeEven(w2, ne, before(w2, d2), need, true),
    });
  }
  return out;
}

/** Even per-day take across all flexible categories (split by weight, capped). */
function spreadAllFlexible(w: Work, days: ISODate[], amount: number): number {
  const cats = w.s.profile.categories;
  const dayCap = (d: ISODate) =>
    Math.min(cats.reduce((a, c) => a + cellFree(w, d, c.id, true), 0), Math.max(0, dayRemaining(w, d) - (w.prefs.get(d) ?? 0)));
  let need = amount;
  let active = days.filter((d) => dayCap(d) > 0);
  while (need > 0 && active.length) {
    const parts = active.map(() => 0);
    const q = Math.floor(need / active.length), r = need - q * active.length;
    active.forEach((_, i) => (parts[i] = q + (i >= active.length - r ? 1 : 0)));
    const next: ISODate[] = [];
    let took = 0;
    active.forEach((d, i) => {
      const cap = dayCap(d);
      const x = Math.min(cap, parts[i]);
      took += takeFromDayByWeight(w, d, x);
      if (cap > parts[i]) next.push(d);
    });
    need -= took;
    if (took === 0) break;
    active = next;
  }
  return amount - need;
}

function takeFromDayByWeight(w: Work, d: ISODate, x: number): number {
  const cats = w.s.profile.categories;
  let left = x;
  for (let guard = 0; left > 0 && guard < cats.length + 1; guard++) {
    const open = cats.filter((c) => cellFree(w, d, c.id, true) > 0);
    if (!open.length) break;
    const W = open.reduce((a, c) => a + c.weight, 0);
    const shares = W > 0 ? largestRemainderLocal(left, open.map((c) => c.weight)) : open.map((_, i) => (i === 0 ? left : 0));
    open.forEach((c, i) => {
      const y = Math.min(shares[i], cellFree(w, d, c.id, true));
      if (y > 0) { setP(w, d, c.id, getP(w, d, c.id) - y); left -= y; }
    });
  }
  return x - left;
}

/** Apply a request (earmark) to a cloned base: use the day's non-essential money, borrow
 * from the following week (D16), then (if given) a trade-off strategy for the rest. */
function placeRequest(base: EngineState, r: RequestLike, today: ISODate, key: string, strat: Strategy | null, noBorrow = false): ApplyResult {
  const intent: HypotheticalIntent = {
    kind: 'hypothetical', amount: r.amount, date: r.date, category: r.category, label: r.label,
    idempotencyKey: key, tradeoffOptionId: strat?.id,
  };
  return runHandler(base, intent, today, (w) => {
    const d = r.date, c = r.category;
    const before = dayRemaining(w, d);
    const avail = dayAvailable(w, d, c);
    let need = r.amount.pence - avail;
    let borrowing: Borrowing | undefined;
    if (need > 0 && !noBorrow) {
      const snap = new Map(w.planned);
      const got = borrowWeek(w, d, need);
      if (got > 0) setP(w, d, c, getP(w, d, c) + got);
      borrowing = toBorrowing(w, toSources(w, movesBetween(w, snap, d)));
      need -= got;
    }
    let tradeoff: ChangeSet['tradeoff'];
    if (need > 0) {
      if (!strat)
        return err('shortfall', `${formatMoney(r.amount)} is ${formatMoney(need)} more than ${formatShortDate(d)} can cover, even after borrowing from the following days.`, {
          shortfall: need, dayRemaining: avail, dayRemainingTotal: before, dayAvailable: avail, borrowable: borrowing?.amount.pence ?? 0,
        });
      const snap = new Map(w.planned);
      const moved = strat.run(w, d, need);
      if (moved < need) return err('shortfall', `This option can only free ${formatMoney(moved)}.`);
      setP(w, d, c, getP(w, d, c) + moved);
      tradeoff = { optionId: strat.id, title: strat.title, amount: gbp(moved), sources: toSources(w, movesBetween(w, snap, d)) };
    }
    w.s.plannedPurchases.push({ id: `pp-${key}`, date: d, category: c, amount: r.amount, label: r.label ?? categoryName(w.s, c) });
    refresh(w);
    const use = w.uses.get(cellKey(d, c)) ?? 0;
    const cur = getP(w, d, c);
    if (use > cur) {
      // Make room on the same day: non-essential categories only (essentials untouched).
      const got = intraDayTake(w, d, c, use - cur, 'nonEssential');
      setP(w, d, c, cur + got);
      if (cur + got < use)
        return err('shortfall', `${formatMoney(r.amount)} doesn't fit on ${formatShortDate(d)}.`, { shortfall: use - cur - got });
    }
    if (cashViolations(w.s, today, w.planned).length && !repairCash(w))
      return err('cash-constraint', 'That would spend money before it arrives.');
    return {
      extras: {
        amount: r.amount,
        target: { day: d, category: c, categoryName: categoryName(w.s, c), label: r.label },
        dayRemainingBefore: gbp(before),
        dayRemainingAfter: gbp(dayRemaining(w, d)),
        dayAvailableBefore: gbp(avail),
        ...(borrowing ? { borrowed: borrowing } : {}),
        ...(tradeoff ? { tradeoff, shortfall: tradeoff.amount } : {}),
      },
    };
  });
}

/** What a request could get: the day's non-essential money and the borrowable week. */
function measure(base: EngineState, r: RequestLike, today: ISODate, noBorrow = false) {
  const w = makeWork(clone(base), today);
  const remaining = dayRemaining(w, r.date);
  const avail = dayAvailable(w, r.date, r.category);
  let borrowable = 0;
  let borrowing: Borrowing | undefined;
  if (r.amount.pence > avail && !noBorrow) {
    const snap = new Map(w.planned);
    borrowable = borrowWeek(w, r.date, r.amount.pence - avail);
    borrowing = toBorrowing(w, toSources(w, movesBetween(w, snap, r.date)));
  }
  return { w: makeWork(clone(base), today), remaining, avail, borrowable, borrowing };
}

function uniqueKey(s: EngineState, k: string): string {
  let key = k;
  for (let n = 2; s.processedKeys.includes(key) || s.plannedPurchases.some((x) => x.id === `pp-${key}`); n++) key = `${k}#${n}`;
  return key;
}

const essentialNames = (s: EngineState) =>
  s.profile.categories.filter((c) => c.essential).map((c) => c.name.toLowerCase());

export function affordability(state: EngineState, r: RequestLike, today: ISODate): Affordability | Fail {
  let base: EngineState;
  try { base = ensurePlan(state, today); } catch (e) { return err('invalid', (e as Error).message); }
  const bad = validateRequest(base, r, today);
  if (bad) return bad;
  let noBorrow = false;
  let m = measure(base, r, today);
  if (m.borrowable > 0 && r.amount.pence <= m.avail + m.borrowable) {
    // Borrowing back from days after an income can spend money before it arrives: then
    // the week cannot lend, and the request is treated as not fitting (with options).
    const trial = placeRequest(base, r, today, '__trial__', null);
    if (!trial.ok && trial.error?.code === 'cash-constraint') { noBorrow = true; m = measure(base, r, today, true); }
  }
  const { w, remaining, avail, borrowable, borrowing } = m;
  if (r.idempotencyKey && base.processedKeys.includes(r.idempotencyKey)) {
    const intent: HypotheticalIntent = { kind: 'hypothetical', amount: r.amount, date: r.date, category: r.category, label: r.label, idempotencyKey: r.idempotencyKey };
    const n = noop(base, intent, today);
    if (!n.ok) return n;
    return {
      fits: true, amount: r.amount.pence, dayRemaining: avail, dayRemainingTotal: remaining, remainingAfter: remaining, dayAvailable: avail, borrowed: 0,
      alreadyApplied: true, message: 'Already set aside.',
      preview: { nextState: n.nextState, diff: n.diff, explanation: n.explanationFacts },
    };
  }
  const key = r.idempotencyKey ?? uniqueKey(base, `req:${r.date}:${r.category}:${r.amount.pence}`);
  const day = formatShortDate(r.date);
  if (r.amount.pence <= avail + borrowable) {
    const res = placeRequest(base, r, today, key, null, noBorrow);
    if (!res.ok) return res;
    const b = res.diff.borrowed;
    return {
      fits: true, amount: r.amount.pence, dayRemaining: avail, dayRemainingTotal: remaining,
      remainingAfter: res.diff.dayRemainingAfter?.pence ?? remaining - r.amount.pence,
      dayAvailable: avail, borrowed: b?.amount.pence ?? 0, borrowing: b,
      message: b
        ? `Fits — ${formatMoney(b.amount)} comes from ${borrowWhat(b)} over ${formatDayRange(b.from, b.to)}`
        : `Fits — ${day} has ${formatMoney(avail)} to spare`,
      preview: { nextState: res.nextState, diff: res.diff, explanation: res.explanationFacts },
    };
  }
  const shortfall = r.amount.pence - avail - borrowable;
  const ess = essentialNames(base);
  const options: TradeoffOption[] = [];
  const seen = new Set<string>();
  for (const st of strategies(w, r.date)) {
    const res = placeRequest(base, r, today, key, st, noBorrow);
    if (!res.ok) continue;
    const t = res.diff.tradeoff;
    const sig = JSON.stringify(t?.sources ?? []);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const sources = (t?.sources ?? []).map((x) => ({
      category: x.category, categoryName: x.categoryName, amount: x.amount.pence, from: x.from, to: x.to, days: x.days.length,
    }));
    options.push({
      id: st.id, title: st.title, sources, borrowed: res.diff.borrowed?.amount.pence ?? 0,
      preview: { nextState: res.nextState, diff: res.diff, explanation: res.explanationFacts },
    });
  }
  const protectedWords = ess.length ? `${[...ess, 'protected money'].slice(0, -1).join(', ')} or protected money` : 'protected money';
  return {
    fits: false, amount: r.amount.pence, dayRemaining: avail, dayRemainingTotal: remaining, shortfall, options,
    dayAvailable: avail, borrowable, borrowing,
    message: `${formatMoney(shortfall)} short — ${day} has ${formatMoney(avail)} to spare${
      borrowing ? ` and ${formatMoney(borrowable)} can be borrowed from ${borrowWhat(borrowing)} over ${formatDayRange(borrowing.from, borrowing.to)}` : ''
    } without touching ${protectedWords}`,
  };
}

function hypothetical(base: EngineState, intent: HypotheticalIntent, today: ISODate): ApplyResult {
  const bad = validateRequest(base, intent, today);
  if (bad) return bad;
  let m = measure(base, intent, today);
  let noBorrow = false;
  if (m.borrowable > 0 && intent.amount.pence <= m.avail + m.borrowable) {
    const res = placeRequest(base, intent, today, intent.idempotencyKey, null);
    if (res.ok || res.error?.code !== 'cash-constraint') return res;
    noBorrow = true;
    m = measure(base, intent, today, true);
  }
  const { w, remaining, avail, borrowable } = m;
  if (intent.amount.pence <= avail + borrowable) return placeRequest(base, intent, today, intent.idempotencyKey, null, noBorrow);
  const shortfall = intent.amount.pence - avail - borrowable;
  if (!intent.tradeoffOptionId)
    return err('shortfall', `${formatMoney(intent.amount)} is ${formatMoney(shortfall)} more than ${formatShortDate(intent.date)} can cover, even after borrowing from the following days.`, {
      shortfall, dayRemaining: avail, dayRemainingTotal: remaining, dayAvailable: avail, borrowable,
    });
  const st = strategies(w, intent.date).find((s) => s.id === intent.tradeoffOptionId);
  if (!st) return err('unknown-option', 'That trade-off option is no longer available.');
  return placeRequest(base, intent, today, intent.idempotencyKey, st, noBorrow);
}

// --------------------------- commitments ----------------------------------

function findCommitment(s: EngineState, target: string): Commitment | Fail {
  const byId = s.commitments.find((c) => c.id === target);
  if (byId) return byId;
  const t = target.trim().toLowerCase();
  const hits = s.commitments.filter((c) => c.name.toLowerCase() === t || c.name.toLowerCase().includes(t));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) return ask('target', `Which bill do you mean? You have ${s.commitments.map((c) => c.name).join(', ') || 'none'}.`);
  return ask('target', `Which one: ${hits.map((c) => c.name).join(' or ')}?`);
}

function commitmentChange(base: EngineState, intent: Extract<Intent, { kind: 'commitmentChange' }>, today: ISODate): ApplyResult {
  const ch = intent.change;
  const end = base.profile.horizonEnd;
  let target: Commitment | null = null;
  if (ch.op !== 'add') {
    const f = findCommitment(base, ch.target);
    if ('ok' in f) return f;
    target = f;
    const bad = checkDate(ch.effectiveFrom, 'effectiveFrom');
    if (bad) return bad;
    if (ch.effectiveFrom < today) return err('out-of-range', 'Changes can only start today or later; past bills stay as they were.');
  }
  if (ch.op === 'adjust') {
    if (!isMoney(ch.delta)) return checkAmount(ch.delta)!;
    if (ch.delta.pence === 0) return ask('amount', 'By how much does it change?');
  }
  if (ch.op === 'set' || ch.op === 'add') {
    const bad = checkAmount(ch.amount);
    if (bad) return bad;
  }
  if (ch.op === 'add') {
    if (!ch.name) return ask('name', 'What is the bill called?');
    const r = ch.recurrence;
    if (r.kind === 'once' && (!isISODate(r.date) || r.date < today)) return ask('date', 'When is it due?');
    if (r.kind === 'monthly' && !(Number.isInteger(r.dayOfMonth) && r.dayOfMonth >= 1 && r.dayOfMonth <= 31)) return ask('dayOfMonth', 'Which day of the month is it due?');
  }
  return runHandler(base, intent, today, (w) => {
    const s = w.s;
    let c: Commitment;
    let effectiveFrom: ISODate;
    if (ch.op === 'add') {
      c = { id: `c-${intent.idempotencyKey}`, name: ch.name, amount: ch.amount, recurrence: ch.recurrence, locked: true };
      s.commitments.push(c);
      effectiveFrom = ch.recurrence.kind === 'once' ? ch.recurrence.date : today;
    } else {
      c = s.commitments.find((x) => x.id === target!.id)!;
      effectiveFrom = ch.effectiveFrom;
    }
    const oldOcc = ch.op === 'add' ? [] : occurrences(target!, today, end);
    const beforeAmt = ch.op === 'add' ? 0 : amountOn(c, effectiveFrom);
    if (ch.op === 'adjust' || ch.op === 'set') {
      const nextAmt = ch.op === 'set' ? ch.amount.pence : beforeAmt + ch.delta.pence;
      if (nextAmt < 0) return err('invalid', `${c.name} can't go below £0.`);
      c.amountChanges = [...(c.amountChanges ?? []).filter((x) => x.from < effectiveFrom), { from: effectiveFrom, amount: gbp(nextAmt) }];
    } else if (ch.op === 'remove') {
      if (c.recurrence.kind === 'once') { if (c.recurrence.date >= effectiveFrom) c.amountChanges = [{ from: effectiveFrom, amount: gbp(0) }]; }
      else c.amountChanges = [...(c.amountChanges ?? []).filter((x) => x.from < effectiveFrom), { from: effectiveFrom, amount: gbp(0) }];
    }
    const newOcc = occurrences(c, today, end);
    const byDate = new Map<ISODate, number>();
    for (const o of newOcc) byDate.set(o.date, (byDate.get(o.date) ?? 0) + o.pence);
    for (const o of oldOcc) byDate.set(o.date, (byDate.get(o.date) ?? 0) - o.pence);
    const inc = [...byDate.values()].filter((x) => x > 0).reduce((a, b) => a + b, 0);
    const decs = [...byDate.entries()].filter(([, x]) => x < 0).sort();
    let replan = false;
    if (inc > 0) {
      const taken = takeEven(w, takeOrder(s), reallocDays(w), inc, true);
      w.gap += inc - taken;
    }
    if (decs.length) {
      if (w.gap > 0) replan = true;
      else
        for (const [date, x] of decs) {
          const days = reallocDays(w).filter((d) => d >= date);
          if (days.length) addEven(w, -x, days);
          else w.unallocated += -x;
        }
    }
    const totalDelta = [...byDate.values()].reduce((a, b) => a + b, 0);
    return {
      replan,
      extras: {
        commitment: {
          name: c.name,
          before: gbp(beforeAmt),
          after: gbp(amountOn(c, effectiveFrom)),
          effectiveFrom,
          totalDelta: gbp(totalDelta),
        },
      },
    };
  });
}

export { getP, dayRemaining };
