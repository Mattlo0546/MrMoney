import { CATALOGUE } from './catalogue';
import type { Offer, OfferContext, PlannedCategory, PotentialSaving, RankedOffer } from './types';

const norm = (s: string): string => s.trim().toLowerCase();

function areaApplies(offer: Offer, area: string | undefined): boolean {
  if (norm(offer.area) === 'uk') return true;
  return area !== undefined && norm(area).includes(norm(offer.area));
}

/**
 * Rank offers by relevance to planned spending and the user's area.
 * Only offers whose category has planned spend and whose area applies are returned.
 * Score = planned pence in the category (capped so one huge category cannot drown the rest)
 *   + a bonus when the user already holds the required membership,
 *   + a bonus for a London-specific offer when the user is in London.
 * Ties break on higher percentOff, then id, so ordering is deterministic.
 * `diet` is accepted for future use; no sample offer is diet-specific.
 */
export function matchOffers(
  planCategories: readonly PlannedCategory[],
  ctx: OfferContext,
  offers: readonly Offer[] = CATALOGUE,
): RankedOffer[] {
  const planned = new Map<string, number>();
  for (const p of planCategories) {
    if (p.plannedPence > 0) planned.set(p.category, (planned.get(p.category) ?? 0) + p.plannedPence);
  }
  const held = new Set((ctx.memberships ?? []).map(norm));

  const ranked: RankedOffer[] = [];
  for (const offer of offers) {
    const spend = planned.get(offer.category);
    if (spend === undefined || !areaApplies(offer, ctx.area)) continue;
    const eligibleNow = offer.membership === undefined || held.has(norm(offer.membership));
    let score = Math.min(spend, 100_000);
    if (offer.membership !== undefined && eligibleNow) score += 50_000;
    if (norm(offer.area) !== 'uk') score += 10_000;
    ranked.push({ offer, score, eligibleNow });
  }
  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (b.offer.percentOff ?? 0) - (a.offer.percentOff ?? 0) ||
      (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0),
  );
}

/**
 * Estimate of what the offer could save on a planned amount. Always typed 'potential':
 * it only counts as saved once applied to a planned purchase or recorded as a lower actual price (engine's job).
 * Offers with no stated percentage or amount estimate 0.
 */
export function potentialSaving(offer: Offer, plannedAmountPence: number): PotentialSaving {
  const planned = Math.max(0, Math.round(plannedAmountPence));
  let pence = 0;
  if (offer.percentOff !== undefined) pence = Math.floor((planned * offer.percentOff) / 100);
  else if (offer.amountOffPence !== undefined) pence = Math.min(offer.amountOffPence, planned);
  return { kind: 'potential', pence };
}
