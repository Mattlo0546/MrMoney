/** Offer module types. Category ids match the engine's flexible category ids (plain strings). */
export type OfferCategory = 'groceries' | 'transport' | 'eating-out' | 'shopping';
export type OfferConfidence = 'low' | 'medium';

export interface Offer {
  id: string;
  title: string;
  category: OfferCategory;
  discountDescription: string;
  percentOff?: number;
  amountOffPence?: number;
  eligibility: string;
  conditions: string;
  /** 'UK' (anywhere) or a city/region such as 'London'. */
  area: string;
  /** Membership key the user must hold (matches Profile.memberships), if any. */
  membership?: string;
  source: string;
  /** ISO date the entry was last checked against its source. */
  checked: string;
  confidence: OfferConfidence;
  /** Always true: this is a sample catalogue, not a live integration. */
  sample: true;
}

export interface PlannedCategory {
  category: string;
  plannedPence: number;
}

export interface OfferContext {
  area?: string;
  memberships?: string[];
  diet?: string[];
}

export interface RankedOffer {
  offer: Offer;
  score: number;
  /** Whether the user already holds the membership this offer needs (or none is needed). */
  eligibleNow: boolean;
}

/** An estimate only. Never counted as saved until applied to a planned purchase or recorded as a lower actual price (engine's job). */
export interface PotentialSaving {
  kind: 'potential';
  pence: number;
}

export interface OfferSource {
  list(ctx: OfferContext): Promise<Offer[]>;
}
