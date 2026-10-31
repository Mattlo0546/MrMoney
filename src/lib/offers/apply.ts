import {
  computeDiff,
  gbp,
  generatePlan,
  type AppliedDeal,
  type Category,
  type ChangeSet,
  type EngineState,
  type ISODate,
  type PlannedPurchase,
  type PurchaseLine,
  type Transaction,
} from '@/lib/engine';
import type { Offer } from './types';

export interface DealInput {
  id?: string;
  title: string;
  category: string;
  percentOff?: number;
  amountOffPence?: number;
  purchaseId?: string;
}

export interface ApplyDealResult {
  nextState: EngineState;
  savedPence: number;
  matchedCount: number;
  alreadyApplied: boolean;
  appliedDeal: AppliedDeal;
  diff: ChangeSet | null;
}

const MAX_TOTAL_DISCOUNT_RATIO = 0.65;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'deal'
  );
}

/**
 * Match a deal category ('groceries' | 'eating-out' | 'transport' | 'shopping' | 'all')
 * against an engine category id. Falls back gracefully if the user's plan uses 'fun' or 'social'
 * instead of 'shopping' or 'eating-out'.
 */
export function matchesDealCategory(
  itemCategory: string,
  dealCategory: string,
  categories: readonly Category[],
): boolean {
  const item = itemCategory.trim().toLowerCase();
  const target = dealCategory.trim().toLowerCase();
  if (target === 'all' || item === target) return true;
  const ids = new Set(categories.map((c) => c.id.toLowerCase()));
  if (target === 'shopping' && !ids.has('shopping')) {
    return item === 'fun' || item === 'social' || item === 'other';
  }
  if (target === 'eating-out' && !ids.has('eating-out')) {
    return item === 'fun' || item === 'social' || item === 'food';
  }
  return false;
}

function computeDiscountedPence(
  currentPence: number,
  originalPence: number,
  percentOff?: number,
  amountOffPence?: number,
): number {
  if (currentPence <= 1) return currentPence;
  const minAllowed = Math.max(1, Math.round(originalPence * (1 - MAX_TOTAL_DISCOUNT_RATIO)));
  if (currentPence <= minAllowed) return currentPence;

  let rawDiscount = 0;
  if (percentOff !== undefined && percentOff > 0) {
    rawDiscount = Math.max(1, Math.floor((currentPence * percentOff) / 100));
  } else if (amountOffPence !== undefined && amountOffPence > 0) {
    rawDiscount = amountOffPence;
  } else {
    rawDiscount = Math.max(1, Math.floor(currentPence * 0.15));
  }
  return Math.max(minAllowed, currentPence - rawDiscount);
}

/**
 * Apply a student deal or offer to `state`, discounting matching upcoming planned purchases
 * (including itinerary meal/item lines), logged expenses, and/or even-mode daily category allocations,
 * then regenerating the plan so the calendar immediately reflects the lower daily totals.
 */
export function applyDealToState(
  state: EngineState,
  deal: DealInput,
  today: ISODate,
): ApplyDealResult {
  const dealId = deal.id ?? `deal-${slugify(deal.title)}`;
  const existingDeals = state.profile.appliedDeals ?? [];
  const existing = existingDeals.find((d) => d.id === dealId);
  if (existing && !deal.purchaseId) {
    return {
      nextState: state,
      savedPence: existing.savedPence,
      matchedCount: 0,
      alreadyApplied: true,
      appliedDeal: existing,
      diff: null,
    };
  }

  const pct = deal.percentOff ?? (deal.amountOffPence ? undefined : 15);
  const flatOff = deal.amountOffPence;
  const categories = state.profile.categories;

  let savedFromPurchases = 0;
  let matchedPurchases = 0;

  const nextPurchases: PlannedPurchase[] = state.plannedPurchases.map((p) => {
    const matchesId = deal.purchaseId ? p.id === deal.purchaseId : false;
    const matchesCat =
      !deal.purchaseId &&
      p.date >= state.profile.planStart &&
      matchesDealCategory(p.category, deal.category, categories);

    if (!matchesId && !matchesCat) return p;

    const origPurchasePence = p.originalPence ?? p.amount.pence;
    if (p.lines && p.lines.length > 0) {
      let lineSavedTotal = 0;
      const lineFlatShare =
        flatOff !== undefined && p.lines.length > 0
          ? Math.max(1, Math.floor(flatOff / p.lines.length))
          : undefined;

      const nextLines: PurchaseLine[] = p.lines.map((line) => {
        const origLine = line.originalPence ?? line.pence;
        const nextPence = computeDiscountedPence(line.pence, origLine, pct, lineFlatShare);
        const delta = line.pence - nextPence;
        if (delta <= 0) return line;
        lineSavedTotal += delta;
        return {
          ...line,
          pence: nextPence,
          originalPence: origLine,
          dealId,
          dealTitle: deal.title,
        };
      });

      if (lineSavedTotal <= 0) return p;
      const newTotal = nextLines.reduce((s, l) => s + l.pence, 0);
      savedFromPurchases += p.amount.pence - newTotal;
      matchedPurchases += 1;
      return {
        ...p,
        amount: gbp(newTotal),
        originalPence: origPurchasePence,
        dealId,
        dealTitle: deal.title,
        ...(pct !== undefined ? { dealPercentOff: pct } : {}),
        lines: nextLines,
      };
    }

    const nextPence = computeDiscountedPence(p.amount.pence, origPurchasePence, pct, flatOff);
    const delta = p.amount.pence - nextPence;
    if (delta <= 0) return p;
    savedFromPurchases += delta;
    matchedPurchases += 1;
    return {
      ...p,
      amount: gbp(nextPence),
      originalPence: origPurchasePence,
      dealId,
      dealTitle: deal.title,
      ...(pct !== undefined ? { dealPercentOff: pct } : {}),
    };
  });

  // Also discount matching logged expenses on the calendar if no future purchases matched or if targeting a specific entry
  let savedFromLedger = 0;
  let matchedLedger = 0;
  const nextLedger: Transaction[] = state.ledger.map((tx) => {
    if (tx.kind !== 'expense') return tx;
    const matchesId = deal.purchaseId ? tx.id === deal.purchaseId : false;
    const matchesCat =
      !deal.purchaseId && matchesDealCategory(tx.category ?? '', deal.category, categories);
    if (!matchesId && !matchesCat) return tx;

    const origTxPence = tx.originalPence ?? tx.amount.pence;
    const nextPence = computeDiscountedPence(tx.amount.pence, origTxPence, pct, flatOff);
    const delta = tx.amount.pence - nextPence;
    if (delta <= 0) return tx;
    savedFromLedger += delta;
    matchedLedger += 1;
    return {
      ...tx,
      amount: gbp(nextPence),
      originalPence: origTxPence,
      dealId,
      dealTitle: deal.title,
      ...(pct !== undefined ? { dealPercentOff: pct } : {}),
    };
  });

  // In 'even' allocation mode, if the category has un-earmarked planned spend across future days,
  // also discount the category's daily weight and lock the savings into savingsGoal so daily totals drop on the calendar.
  let savedFromEvenPlan = 0;
  let dailySavedPence = 0;
  let matchedEvenDays = 0;
  let nextCategories = state.profile.categories;
  let nextSavingsGoal = state.profile.savingsGoal;

  if (!deal.purchaseId && state.profile.allocationMode !== 'itemised' && state.plan) {
    const futureAllocations = state.plan.allocations.filter((a) => a.day >= today);
    const futureDaysCount = new Set(futureAllocations.map((a) => a.day)).size;
    let unearmarkedCatPence = 0;
    for (const a of futureAllocations) {
      if (matchesDealCategory(a.category, deal.category, categories)) {
        const earmarkedOnDay = nextPurchases
          .filter((p) => p.date === a.day && p.category === a.category)
          .reduce((s, p) => s + p.amount.pence, 0);
        const unearmarked = Math.max(0, a.planned.pence - earmarkedOnDay);
        if (unearmarked > 0) {
          unearmarkedCatPence += unearmarked;
        }
      }
    }

    if (unearmarkedCatPence > 0 && futureDaysCount > 0) {
      const effectivePct = Math.min(35, pct ?? 15);
      savedFromEvenPlan =
        flatOff !== undefined
          ? Math.min(flatOff * Math.max(1, Math.floor(futureDaysCount / 7)), Math.floor(unearmarkedCatPence * 0.5))
          : Math.floor((unearmarkedCatPence * effectivePct) / 100);

      if (savedFromEvenPlan > 0) {
        matchedEvenDays = futureDaysCount;
        dailySavedPence = Math.max(1, Math.round(savedFromEvenPlan / futureDaysCount));
        const ratio = Math.max(0.4, 1 - savedFromEvenPlan / unearmarkedCatPence);
        nextCategories = state.profile.categories.map((c) => {
          if (!matchesDealCategory(c.id, deal.category, categories)) return c;
          return {
            ...c,
            weight: Math.max(0.05, Number((c.weight * ratio).toFixed(4))),
            ...(c.minimumDaily
              ? { minimumDaily: gbp(Math.floor(c.minimumDaily.pence * ratio)) }
              : {}),
          };
        });
        nextSavingsGoal = gbp(state.profile.savingsGoal.pence + savedFromEvenPlan);
      }
    }
  }

  const totalSavedPence = savedFromPurchases + savedFromLedger + savedFromEvenPlan;
  const totalMatched = matchedPurchases + matchedLedger + matchedEvenDays;

  const appliedDeal: AppliedDeal = {
    id: dealId,
    title: deal.title,
    category: deal.category,
    ...(pct !== undefined ? { percentOff: pct } : {}),
    ...(flatOff !== undefined ? { amountOffPence: flatOff } : {}),
    savedPence: totalSavedPence,
    ...(dailySavedPence > 0 ? { dailySavedPence } : {}),
    appliedAt: today,
  };

  const nextProfile = {
    ...state.profile,
    categories: nextCategories,
    savingsGoal: nextSavingsGoal,
    appliedDeals: [...existingDeals.filter((d) => d.id !== dealId), appliedDeal],
  };

  const draft: EngineState = {
    ...state,
    profile: nextProfile,
    plannedPurchases: nextPurchases,
    ledger: nextLedger,
  };
  const nextPlan = generatePlan(draft, today);
  const nextState: EngineState = { ...draft, plan: nextPlan };
  const diff = state.plan ? computeDiff(state, nextState, { kind: 'itinerary', idempotencyKey: dealId, purchases: nextPurchases, mode: state.profile.allocationMode ?? 'even' }, today) : null;

  return {
    nextState,
    savedPence: totalSavedPence,
    matchedCount: totalMatched,
    alreadyApplied: false,
    appliedDeal,
    diff,
  };
}

/**
 * Apply multiple offers at once (e.g. "Apply all deals" button or autonomous agent optimization).
 * Picks the strongest discount per category first so every category gets its best deal, and records all applied offers.
 */
export function applyOffersToState(
  state: EngineState,
  offers: readonly Offer[],
  today: ISODate,
): {
  nextState: EngineState;
  totalSavedPence: number;
  appliedCount: number;
  diff: ChangeSet | null;
} {
  const sorted = [...offers].sort((a, b) => (b.percentOff ?? 0) - (a.percentOff ?? 0));
  let current = state;
  let totalSavedPence = 0;
  let appliedCount = 0;

  // Apply the top deal per category first for clean, realistic calendar discounts, then record remaining selected offers
  const bestByCategory = new Map<string, Offer>();
  for (const offer of sorted) {
    if (!bestByCategory.has(offer.category)) {
      bestByCategory.set(offer.category, offer);
    }
  }

  for (const offer of bestByCategory.values()) {
    const res = applyDealToState(
      current,
      {
        id: offer.id,
        title: offer.title,
        category: offer.category,
        percentOff: offer.percentOff,
        amountOffPence: offer.amountOffPence,
      },
      today,
    );
    if (!res.alreadyApplied && res.savedPence > 0) {
      current = res.nextState;
      totalSavedPence += res.savedPence;
      appliedCount += 1;
    }
  }

  const diff = state.plan && current.plan ? computeDiff(state, current, { kind: 'itinerary', idempotencyKey: 'all-deals', purchases: current.plannedPurchases, mode: state.profile.allocationMode ?? 'even' }, today) : null;
  return { nextState: current, totalSavedPence, appliedCount, diff };
}
