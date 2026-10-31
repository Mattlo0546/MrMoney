import { CATALOGUE } from './catalogue';
import { matchOffers } from './match';
import type { Offer, OfferContext, OfferSource, PlannedCategory } from './types';

/** Reads the static sample catalogue. Returns offers in deterministic catalogue order, filtered by area. */
export class CuratedOfferSource implements OfferSource {
  constructor(private readonly offers: readonly Offer[] = CATALOGUE) {}

  async list(ctx: OfferContext): Promise<Offer[]> {
    const all = new Set(this.offers.map((o) => o.category));
    const planned: PlannedCategory[] = [...all].map((category) => ({ category, plannedPence: 1 }));
    return matchOffers(planned, ctx, this.offers).map((r) => r.offer);
  }
}
