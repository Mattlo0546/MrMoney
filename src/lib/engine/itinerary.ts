/**
 * Creative itinerary support: validation of itinerary purchases and the budget an
 * itinerary may plan against (what is free once commitments, protected money, actuals and
 * non-itinerary planned purchases are accounted for).
 */
import { capSeries, cellUseMap, inflowEvents, poolFor } from './accounting';
import { isISODate } from './dates';
import { MAX_PENCE } from './money';
import { futureDays } from './plan';
import type { Category, CategoryId, EngineState, ISODate, PlannedPurchase } from './types';

export const isItemised = (s: EngineState) => s.profile.allocationMode === 'itemised';

/** The state without any itinerary planned purchases. */
export function withoutItinerary(s: EngineState): EngineState {
  return { ...s, plannedPurchases: s.plannedPurchases.filter((p) => p.source !== 'itinerary') };
}

/** Field errors for an itinerary purchase list (empty = valid). Ids must also not clash with `keep`. */
export function validateItineraryPurchases(
  purchases: unknown, today: ISODate, horizonEnd: ISODate, keep: PlannedPurchase[] = [],
): string | null {
  if (!Array.isArray(purchases)) return 'Purchases must be a list.';
  const ids = new Set(keep.map((p) => p.id));
  const okPence = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= MAX_PENCE;
  for (let i = 0; i < purchases.length; i++) {
    const p = purchases[i] as Partial<PlannedPurchase> | null;
    const at = `Purchase ${i + 1}`;
    if (!p || typeof p !== 'object') return `${at} is not a purchase.`;
    if (typeof p.id !== 'string' || !p.id) return `${at} needs an id.`;
    if (ids.has(p.id)) return `${at}: the id "${p.id}" is used more than once.`;
    ids.add(p.id);
    if (!isISODate(p.date)) return `${at} (${p.id}) needs a valid date.`;
    if (p.date < today || p.date > horizonEnd) return `${at} (${p.id}) must be dated between ${today} and ${horizonEnd}.`;
    if (typeof p.category !== 'string' || !p.category) return `${at} (${p.id}) needs a category.`;
    if (typeof p.label !== 'string') return `${at} (${p.id}) needs a label.`;
    if (!p.amount || p.amount.currency !== 'GBP' || !okPence(p.amount.pence)) return `${at} (${p.id}) needs an amount of £0 or more in GBP.`;
    if (p.lines !== undefined) {
      if (!Array.isArray(p.lines)) return `${at} (${p.id}): lines must be a list.`;
      let sum = 0;
      for (const l of p.lines) {
        if (!l || typeof l !== 'object' || !okPence(l.pence)) return `${at} (${p.id}): every line needs a price of £0 or more in pence.`;
        sum += l.pence;
      }
      if (sum !== p.amount.pence) return `${at} (${p.id}): its lines add up to ${sum}p but the amount is ${p.amount.pence}p.`;
    }
  }
  return null;
}

/** Profile categories plus any category ids used by `purchases` that are missing
 * (name = title-cased id, weight 0, priority = max + 1, not essential). */
export function withItineraryCategories(categories: Category[], purchases: PlannedPurchase[]): Category[] {
  const out = categories.slice();
  const have = new Set(out.map((c) => c.id));
  for (const p of purchases) {
    if (have.has(p.category)) continue;
    have.add(p.category);
    const max = out.reduce((a, c) => Math.max(a, c.priority), 0);
    out.push({ id: p.category, name: titleCase(p.category), weight: 0, priority: max + 1, essential: false });
  }
  return out;
}

function titleCase(id: CategoryId): string {
  return id.replace(/[-_]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || id;
}

export interface ItineraryBudget {
  /** Flexible money free for itinerary purchases over today…horizonEnd. */
  budgetPence: number;
  /** For each day: the most that itinerary purchases dated up to and including that day may total
   * (cash timing, after the non-itinerary uses). Non-decreasing; the last entry equals budgetPence. */
  caps: { date: ISODate; cap: number }[];
  /** Days in the window with confirmed money coming in (incomes, allowances, recorded income). */
  incomeDates: ISODate[];
}

/** What an itinerary may plan: the pool for today (itinerary purchases ignored) minus the money
 * already used from today on (actuals and non-itinerary planned purchases). */
export function itineraryBudget(state: EngineState, today: ISODate): ItineraryBudget {
  const s = withoutItinerary(state);
  const W = futureDays(s, today);
  if (!W.length) return { budgetPence: 0, caps: [], incomeDates: [] };
  const uses = cellUseMap(s);
  const useByDay = new Map<ISODate, number>();
  let usedTotal = 0;
  for (const [k, v] of uses) {
    const d = k.slice(0, 10);
    if (d < today) continue;
    usedTotal += v;
    useByDay.set(d, (useByDay.get(d) ?? 0) + v);
  }
  const budget = Math.max(0, poolFor(s, today) - usedTotal);
  // Uses after the plan's end come out of the pool too; count them on the last day.
  let outside = 0;
  for (const [d, v] of useByDay) if (d > s.profile.horizonEnd) outside += v;
  const raw = capSeries(s, today, W);
  let acc = 0;
  const free = W.map((d, i) => raw[i] - (acc += useByDay.get(d) ?? 0) - (i === W.length - 1 ? outside : 0));
  // Spending by day d counts towards every later day's cap too, so take the suffix minimum.
  for (let i = free.length - 2; i >= 0; i--) free[i] = Math.min(free[i], free[i + 1]);
  const caps = W.map((date, i) => ({ date, cap: Math.max(0, Math.min(budget, free[i])) }));
  const incomeDates = [...new Set(inflowEvents(s, today, s.profile.horizonEnd).filter((e) => e.pence > 0).map((e) => e.date))].sort();
  return { budgetPence: budget, caps, incomeDates };
}
