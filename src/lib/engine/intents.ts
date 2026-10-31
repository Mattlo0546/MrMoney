import { categoryName, takeOrder } from './accounting';
import { endOfMonth, formatShortDate, isISODate } from './dates';
import { computeDiff } from './diff';
import { explain } from './explain';
import { cashViolations, plannedMapOf } from './invariants';
import { formatMoney, gbp, isMoney, largestRemainder as largestRemainderLocal } from './money';
import { finalizePlan, generatePlan, validateState } from './plan';
import { amountOn, occurrences } from './recurrence';
import type {
  ApplyResult, CategoryId, ChangeSet, Clarification, Commitment, EngineError, EngineState,
  Explanation, HypotheticalIntent, ISODate, Intent,
} from './types';
import {
  addEven, cellFree, dayRemaining, daysAfter, getP, intraDayTake, makeWork, reallocDays,
  refresh, setP, takeEven, type Work,
} from './work';

const clone = <T>(x: T): T => structuredClone(x);

/** Returns a state whose plan is computed for `today` (rolls the plan forward on a new day). */
export function ensurePlan(state: EngineState, today: ISODate): EngineState {
  if (state.plan && state.plan.computedFor === today) return state;
  const next = clone(state);
  next.plan = generatePlan(next, today);
  return next;
}

type Fail = { ok: false; error: EngineError } | { ok: false; needsClarification: Clarification };
const err = (code: EngineError['code'], message: string, details?: unknown): Fail => ({ ok: false, error: { code, message, details } });
const ask = (field: string, question: string): Fail => ({ ok: false, needsClarification: { field, question } });

function checkAmount(m: unknown, field = 'amount'): Fail | null {
  if (typeof m === 'object' && m !== null && (m as { currency?: string }).currency && (m as { currency: string }).currency !== 'GBP')
    return ask(field, `That amount isn't in pounds. How much is it in GBP?`);
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
    next.plan = finalizePlan(next, today, w.planned, w.gap, w.unallocated, w.reasons);
    if (cashViolations(next, today, plannedMapOf(next)).length) replanned = true;
  }
  if (replanned) next.plan = generatePlan(next, today);
  const diff = computeDiff(base, next, intent, today, { ...out.extras, replanned });
  return { ok: true, nextState: next, diff, explanationFacts: explain(diff) };
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
      return runHandler(base, intent, today, (w) => expense(w, intent.date, intent.category, intent.amount.pence, intent));
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
      const bad = checkAmount(intent.amount);
      if (bad) return bad;
      return runHandler(base, intent, today, (w) => {
        const beforeGoal = w.s.profile.savingsGoal;
        w.s.profile.savingsGoal = gbp(beforeGoal.pence + intent.amount.pence);
        const taken = takeEven(w, takeOrder(w.s), reallocDays(w), intent.amount.pence, true);
        if (taken < intent.amount.pence)
          return err('insufficient-flexible', `Only ${formatMoney(taken)} of flexible money is available to save.`);
        return { extras: { amount: intent.amount, savingsGoal: { before: beforeGoal, after: w.s.profile.savingsGoal } } };
      });
    }
    case 'settingsEdit': {
      const patched = clone(base);
      Object.assign(patched.profile, clone(intent.patch));
      const errs = validateState(patched);
      if (intent.patch.horizonEnd && intent.patch.horizonEnd < today) errs.horizonEnd = 'The end date must be today or later.';
      if (Object.keys(errs).length) return err('invalid', Object.values(errs)[0], errs);
      return runHandler(base, intent, today, (w) => {
        Object.assign(w.s.profile, clone(intent.patch));
        return {
          replan: true,
          extras: intent.patch.savingsGoal ? { savingsGoal: { before: base.profile.savingsGoal, after: intent.patch.savingsGoal } } : {},
        };
      });
    }
    default:
      return err('invalid', `Unknown intent kind.`);
  }
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

function expense(w: Work, date: ISODate, cat: CategoryId, amount: number, intent: Intent): Outcome {
  const key = intent.idempotencyKey;
  const note = intent.kind === 'expense' ? intent.note : undefined;
  w.s.ledger.push({ id: `tx-${key}`, idempotencyKey: key, date, amount: gbp(amount), kind: 'expense', category: cat, note });
  let overspend: number;
  if (date === w.today) {
    refresh(w);
    const newUse = w.uses.get(`${date}|${cat}`) ?? 0;
    const old = getP(w, date, cat);
    // The day's own allowance absorbs it: same category first, then the day's other
    // categories (lowest priority first).
    const fromDay = newUse > old ? intraDayTake(w, date, cat, newUse - old) : 0;
    setP(w, date, cat, old + fromDay);
    overspend = Math.max(0, newUse - old - fromDay);
  } else {
    refresh(w);
    overspend = amount; // history keeps its plan; the money now comes out of future days
  }
  let taken = 0;
  if (overspend > 0) {
    const days = reallocDays(w).filter((d) => !(date === w.today && d === date));
    taken = takeEven(w, takeOrder(w.s), days, overspend, true);
    if (taken < overspend) taken += takeEven(w, takeOrder(w.s), days, overspend - taken, false);
    if (date === w.today) setP(w, date, cat, getP(w, date, cat) + overspend);
    w.gap += overspend - taken;
  }
  return {
    extras: {
      amount: gbp(amount),
      target: { day: date, category: cat, categoryName: categoryName(w.s, cat) },
      absorbed: gbp(Math.max(0, amount - overspend)),
      overspend: gbp(overspend),
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

const nonEssentialOrder = (w: Work) =>
  takeOrder(w.s).filter((c) => !w.s.profile.categories.find((x) => x.id === c)!.essential);

// --------------------------- hypothetical / affordability -----------------

export interface TradeoffOption {
  id: string;
  title: string;
  /** Flexible money moved into the request day, by source category. */
  sources: { category: CategoryId; categoryName: string; amount: number; from: ISODate; to: ISODate; days: number }[];
  preview: { nextState: EngineState; diff: ChangeSet; explanation: Explanation };
}

export type Affordability =
  | { fits: true; amount: number; dayRemaining: number; remainingAfter: number; preview: { nextState: EngineState; diff: ChangeSet; explanation: Explanation } }
  | { fits: false; amount: number; dayRemaining: number; shortfall: number; options: TradeoffOption[] };

interface RequestLike { amount: HypotheticalIntent['amount']; date: ISODate; category: CategoryId; label?: string; idempotencyKey?: string }

function validateRequest(base: EngineState, r: RequestLike, today: ISODate): Fail | null {
  const bad = checkAmount(r.amount) ?? checkDate(r.date);
  if (bad) return bad;
  if (!r.category) return ask('category', 'What is it for?');
  if (r.date < today) return err('out-of-range', 'That day has passed. Did you mean to record an expense?');
  if (r.date > base.profile.horizonEnd) return err('out-of-range', 'That day is after the end of your plan.');
  return null;
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


/** Apply a request (earmark) to a cloned base, optionally after a trade-off strategy. */
function placeRequest(base: EngineState, r: RequestLike, today: ISODate, key: string, strat: Strategy | null): ApplyResult {
  const intent: HypotheticalIntent = {
    kind: 'hypothetical', amount: r.amount, date: r.date, category: r.category, label: r.label,
    idempotencyKey: key, tradeoffOptionId: strat?.id,
  };
  return runHandler(base, intent, today, (w) => {
    const d = r.date, c = r.category;
    const before = dayRemaining(w, d);
    let moved = 0;
    if (strat) {
      const need = r.amount.pence - before;
      moved = strat.run(w, d, need);
      if (moved < need) return err('shortfall', `This option can only free ${formatMoney(moved)}.`);
      setP(w, d, c, getP(w, d, c) + moved);
    }
    w.s.plannedPurchases.push({ id: `pp-${key}`, date: d, category: c, amount: r.amount, label: r.label ?? categoryName(w.s, c) });
    refresh(w);
    const use = w.uses.get(`${d}|${c}`) ?? 0;
    const cur = getP(w, d, c);
    if (use > cur) {
      const got = intraDayTake(w, d, c, use - cur);
      setP(w, d, c, cur + got);
      if (cur + got < use)
        return err('shortfall', `${formatMoney(r.amount)} doesn't fit on ${formatShortDate(d)}.`, { shortfall: use - cur - got });
    }
    if (cashViolations(w.s, today, w.planned).length)
      return err('cash-constraint', 'That would spend money before it arrives.');
    return {
      extras: {
        amount: r.amount,
        target: { day: d, category: c, categoryName: categoryName(w.s, c), label: r.label },
        dayRemainingBefore: gbp(before),
        dayRemainingAfter: gbp(dayRemaining(w, d)),
        shortfall: strat ? gbp(r.amount.pence - before) : undefined,
      },
    };
  });
}

export function affordability(state: EngineState, r: RequestLike, today: ISODate): Affordability | Fail {
  let base: EngineState;
  try { base = ensurePlan(state, today); } catch (e) { return err('invalid', (e as Error).message); }
  const bad = validateRequest(base, r, today);
  if (bad) return bad;
  const key = r.idempotencyKey ?? `req:${r.date}:${r.category}:${r.amount.pence}`;
  const w = makeWork(clone(base), today);
  const remaining = dayRemaining(w, r.date);
  if (r.amount.pence <= remaining) {
    const res = placeRequest(base, r, today, key, null);
    if (!res.ok) return res;
    return {
      fits: true, amount: r.amount.pence, dayRemaining: remaining, remainingAfter: remaining - r.amount.pence,
      preview: { nextState: res.nextState, diff: res.diff, explanation: res.explanationFacts },
    };
  }
  const shortfall = r.amount.pence - remaining;
  const options: TradeoffOption[] = [];
  const seen = new Set<string>();
  for (const st of strategies(w, r.date)) {
    const res = placeRequest(base, r, today, key, st);
    if (!res.ok) continue;
    const sig = JSON.stringify(res.diff.sources);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const sources = res.diff.sources
      .filter((s) => s.days.some((d) => d !== r.date))
      .map((s) => {
        const days = s.days.filter((d) => d !== r.date);
        const amount = res.diff.cellChanges
          .filter((ch) => ch.field === 'planned' && ch.category === s.category && ch.day !== r.date && ch.to.pence < ch.from.pence)
          .reduce((a, ch) => a + ch.from.pence - ch.to.pence, 0);
        return { category: s.category, categoryName: s.categoryName, amount, from: days[0], to: days[days.length - 1], days: days.length };
      });
    options.push({ id: st.id, title: st.title, sources, preview: { nextState: res.nextState, diff: res.diff, explanation: res.explanationFacts } });
    if (options.length === 3) break;
  }
  return { fits: false, amount: r.amount.pence, dayRemaining: remaining, shortfall, options };
}

function hypothetical(base: EngineState, intent: HypotheticalIntent, today: ISODate): ApplyResult {
  const bad = validateRequest(base, intent, today);
  if (bad) return bad;
  const w = makeWork(clone(base), today);
  const remaining = dayRemaining(w, intent.date);
  if (intent.amount.pence <= remaining) return placeRequest(base, intent, today, intent.idempotencyKey, null);
  if (!intent.tradeoffOptionId)
    return err('shortfall', `${formatMoney(intent.amount)} is ${formatMoney(intent.amount.pence - remaining)} more than ${formatShortDate(intent.date)} has left.`, {
      shortfall: intent.amount.pence - remaining, dayRemaining: remaining,
    });
  const st = strategies(w, intent.date).find((s) => s.id === intent.tradeoffOptionId);
  if (!st) return err('unknown-option', 'That trade-off option is no longer available.');
  return placeRequest(base, intent, today, intent.idempotencyKey, st);
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
