/**
 * Creative spending plan ("itinerary") contracts. Every penny the plan assigns to a day traces back to a real
 * product, fare or item with a source URL (Google Search–grounded research, or the curated fallback catalogue).
 * Rent and utilities are commitments (one-off monthly payments) and never appear here.
 * Money is integer pence (GBP). Dates are ISO days (Europe/London).
 */
import type { ISODate, ItemRef, PlannedPurchase } from '@/lib/engine';

/** A real, buyable product at a UK retailer. */
export interface CatalogProduct {
  id: string;
  name: string;
  merchant: string;
  /** e.g. "tesco.com" */
  domain: string;
  pricePence: number;
  /** e.g. "510g", "6 pack", "UK 9". */
  packSize?: string;
  /** Product page, or the retailer's search page for this exact product when no product URL was grounded. */
  url: string;
  sourceTitle?: string;
  /** ISO date the price was checked. */
  checked: ISODate;
  origin: 'research' | 'catalogue';
  confidence?: 'low' | 'medium';
  /** Staples that last many meals (sauces, oils, spices) and equipment (frying pan): bought once, asked about. */
  kind: 'fresh' | 'staple' | 'equipment' | 'item';
}

export interface RecipeIngredient {
  productId: string;
  /** Per cook, human readable: "2 eggs", "1 tbsp". */
  qty: string;
  /** Fraction of one pack used per cook (0 < portion <= 1, e.g. 2 of 6 eggs = 0.333). Staples are small, e.g. 0.05. */
  portion: number;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  meal: 'breakfast' | 'lunch' | 'dinner';
  /** budget < standard < treat (treat = the "I want to spend more on this" days). */
  tier: 'budget' | 'standard' | 'treat';
  ingredients: RecipeIngredient[];
  /** Product ids of equipment needed (frying pan, wok): bought once unless owned. */
  equipment: string[];
  /** Recipe source page (BBC Good Food etc.), when known. */
  recipeUrl?: string;
  tags?: string[];
}

/** A TfL fare for a journey on a named line. */
export interface TransportFare {
  id: string;
  /** e.g. "Circle line", "Hammersmith & City line", "Metropolitan line", "District line", "Bus". */
  line: string;
  from: string;
  to: string;
  /** e.g. "Zones 1-2". */
  zones: string;
  peakPence: number;
  offPeakPence: number;
  /** Pay-as-you-go daily cap for these zones. */
  dailyCapPence: number;
  url: string;
  sourceTitle?: string;
  checked: ISODate;
  origin: 'research' | 'catalogue';
}

/** A one-off thing the student wants (trainers, a dinner out, a gig). */
export interface WantItem {
  id: string;
  label: string;
  bucket: 'shopping' | 'eatingOut' | 'fun';
  productId: string;
}

export interface Catalog {
  products: Record<string, CatalogProduct>;
  recipes: Recipe[];
  fares: TransportFare[];
  wants: WantItem[];
  /** true when at least part came from live grounded research. */
  live: boolean;
  generatedAt: string;
  /** Search queries / notes for display ("Searched: tesco oyster sauce price ..."). */
  sources?: string[];
}

export const TUBE_LINES = [
  'Bakerloo line', 'Central line', 'Circle line', 'District line', 'Hammersmith & City line', 'Jubilee line',
  'Metropolitan line', 'Northern line', 'Piccadilly line', 'Victoria line', 'Waterloo & City line', 'Elizabeth line', 'Bus',
] as const;

export interface ItineraryPrefs {
  city: 'London';
  /** e.g. ["Chinese", "Italian"]. */
  cuisines: string[];
  diet?: string;
  /** Lines the student uses, from TUBE_LINES. */
  lines: string[];
  homeStation: string;
  campusStation: string;
  /** 0 = Sunday … 6 = Saturday. */
  commuteDays: number[];
  /** Free text wants, e.g. ["new running trainers", "a nice ramen dinner out"]. */
  wants: string[];
  /** Treat-meal days per week (0-3). */
  treatsPerWeek: number;
}

export const DEFAULT_PREFS: ItineraryPrefs = {
  city: 'London',
  cuisines: ['Chinese', 'Italian', 'British'],
  lines: ['Circle line'],
  homeStation: "King's Cross St. Pancras",
  campusStation: 'South Kensington',
  commuteDays: [1, 2, 3, 4, 5],
  wants: ['new trainers'],
  treatsPerWeek: 1,
};

/** Clarifications the student answers; the plan is rescheduled locally from them (no new research). */
export interface Answers {
  /** productId -> true when the student already has it (cost drops to 0). */
  owned: Record<string, boolean>;
  /** Recipe ids the student does not like (never scheduled). */
  disliked: string[];
  /** Recipe ids the student loves (scheduled more often). */
  liked: string[];
  /** Want ids the student dropped. */
  droppedWants: string[];
}

export const EMPTY_ANSWERS: Answers = { owned: {}, disliked: [], liked: [], droppedWants: [] };

export interface Question {
  id: string;
  kind: 'owned' | 'likeRecipe' | 'keepWant';
  text: string;
  /** productId for 'owned', recipeId for 'likeRecipe', wantId for 'keepWant'. */
  target: string;
  /** Pence saved if answered "yes, I have it" / "drop it". */
  savingPence?: number;
}

/** Engine category ids the plan should use (resolved from the profile by the caller). */
export interface CategoryMap {
  groceries: string;
  transport: string;
  eatingOut: string;
  shopping: string;
}

export interface ScheduleInput {
  catalog: Catalog;
  prefs: ItineraryPrefs;
  answers: Answers;
  /** First and last day to plan (inclusive). */
  start: ISODate;
  end: ISODate;
  /** Flexible money available over start..end (engine pool minus actuals/other planned purchases). */
  budgetPence: number;
  /** Optional cash caps: cumulative spend up to `date` must stay <= `cap` (money arriving later can't be spent earlier). */
  caps?: { date: ISODate; cap: number }[];
  /** Dates money arrives (payday treat placement). */
  incomeDates?: ISODate[];
  categories: CategoryMap;
  /** Seed for deterministic variety. */
  seed?: number;
}

export interface ScheduleResult {
  /** source: 'itinerary', ids prefixed 'itin-', each with lines (Σ lines = amount) and a ref. */
  purchases: PlannedPurchase[];
  totalPence: number;
  /** budget − total: money not tied to any purchase yet (kept as buffer). */
  leftoverPence: number;
  byBucket: { groceries: number; transport: number; eatingOut: number; shopping: number };
  questions: Question[];
  /** Short human notes, e.g. "Swapped 3 treat dinners for budget ones to fit £214.50". */
  notes: string[];
}

/** POST /api/itinerary request and response. */
export interface CatalogRequest {
  prefs: ItineraryPrefs;
  today: ISODate;
}
export interface CatalogResponse {
  catalog: Catalog;
}

export function refFor(p: CatalogProduct): ItemRef {
  return {
    id: p.id,
    origin: p.origin,
    merchant: p.merchant,
    domain: p.domain,
    item: p.name,
    detail: p.packSize,
    pricePence: p.pricePence,
    sourceUrl: p.url,
    sourceTitle: p.sourceTitle,
    checked: p.checked,
    confidence: p.confidence,
  };
}

export function fareRef(f: TransportFare, pence: number): ItemRef {
  return {
    id: f.id,
    origin: f.origin,
    merchant: 'Transport for London',
    domain: 'tfl.gov.uk',
    item: `${f.line}: ${f.from} → ${f.to}`,
    detail: f.zones,
    pricePence: pence,
    sourceUrl: f.url,
    sourceTitle: f.sourceTitle,
    checked: f.checked,
  };
}
