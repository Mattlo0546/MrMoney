/**
 * Pure: turns a lifestyle and a menu of real food prices into one planned purchase per calendar day (each line traced
 * to a deal and its source), and does every sum the chat quotes (food per month, savings per month and per year,
 * interest at the researched savings rate). No model arithmetic anywhere.
 */
import { addDays, dateRange, dayOfWeek, daysInMonth, gbp } from '@/lib/engine';
import type { ISODate, ItemRef, PlannedPurchase, PurchaseLine } from '@/lib/engine';
import { FALLBACK_DEALS } from './fallback';
import { DEAL_KINDS, LIFESTYLES, type DealKind, type FoodDeal, type Lifestyle, type LifestyleMenu } from './types';

/** Meal deals within this much of the cheapest one count as "just as cheap" and are rotated for variety. */
export const TIE_PENCE = 10;

/** The cheapest deals per kind. Live research wins over the curated fallback for any kind it found. */
export function dealsByKind(menu: LifestyleMenu): Record<DealKind, FoodDeal[]> {
  const out = {} as Record<DealKind, FoodDeal[]>;
  for (const k of DEAL_KINDS) {
    const live = menu.deals.filter((x) => x.kind === k && x.origin === 'research');
    const pool = live.length ? live : [...menu.deals, ...FALLBACK_DEALS].filter((x) => x.kind === k);
    const seen = new Set<string>();
    out[k] = pool.filter((x) => !seen.has(x.id) && seen.add(x.id)).sort((a, b) => a.pricePence - b.pricePence || a.merchant.localeCompare(b.merchant));
  }
  return out;
}

const cheapest = (xs: FoodDeal[]) => xs.filter((x) => x.pricePence <= xs[0].pricePence + TIE_PENCE);

type Slot = 'Coffee' | 'Lunch' | 'Dinner';
interface Meal { slot: Slot; deal: FoodDeal }

/** What a day looks like for each lifestyle. dow: 0 = Sunday … 6 = Saturday; i = day number (for rotation). */
export function mealsFor(lifestyle: Lifestyle, dow: number, i: number, by: Record<DealKind, FoodDeal[]>): Meal[] {
  const md = cheapest(by.meal_deal);
  const dinner = cheapest(by.cheap_dinner);
  const pick = (xs: FoodDeal[], n: number) => xs[n % xs.length];
  const weekend = dow === 0 || dow === 6;
  switch (lifestyle) {
    case 'brokie':
      return [{ slot: 'Lunch', deal: pick(md, i) }, { slot: 'Dinner', deal: pick(md, i + 1) }];
    case 'balanced':
      return [{ slot: 'Lunch', deal: pick(md, i) }, { slot: 'Dinner', deal: dow === 5 ? by.takeaway[0] : pick(dinner, i) }];
    case 'comfy':
      return [
        { slot: 'Coffee', deal: by.coffee[0] },
        { slot: 'Lunch', deal: weekend ? pick(md, i) : by.lunch_out[0] },
        { slot: 'Dinner', deal: dow === 6 ? by.dinner_out[0] : dow === 5 ? by.takeaway[0] : pick(dinner, i) },
      ];
    case 'baller':
      return [
        { slot: 'Coffee', deal: by.coffee[0] },
        { slot: 'Lunch', deal: by.lunch_out[0] },
        { slot: 'Dinner', deal: dow >= 4 ? by.dinner_out[0] : by.takeaway[0] },
      ];
  }
}

const SUPERMARKET: DealKind[] = ['meal_deal', 'cheap_dinner'];

function ref(x: FoodDeal): ItemRef {
  return {
    id: x.id, origin: x.origin, merchant: x.merchant, ...(x.domain ? { domain: x.domain } : {}), item: x.name,
    ...(x.condition ? { detail: x.condition } : {}), pricePence: x.pricePence, sourceUrl: x.url,
    ...(x.sourceTitle ? { sourceTitle: x.sourceTitle } : {}), checked: x.checked, ...(x.confidence ? { confidence: x.confidence } : {}),
  };
}

function label(meals: Meal[]): string {
  const deals = meals.filter((m) => m.deal.kind === 'meal_deal');
  if (deals.length === meals.length) return deals.length === 2 ? '2 meal deals' : 'Meal deal';
  return meals.filter((m) => m.slot !== 'Coffee').map((m) => `${m.deal.merchant}`).join(' + ');
}

export interface CategoryIds { groceries: string; eatingOut: string }

/** One planned purchase per day from start to end (inclusive). */
export function lifestyleSchedule(menu: LifestyleMenu, lifestyle: Lifestyle, start: ISODate, end: ISODate, cats: CategoryIds): PlannedPurchase[] {
  const by = dealsByKind(menu);
  return dateRange(start, end).map((date, i) => {
    const meals = mealsFor(lifestyle, dayOfWeek(date), i, by);
    const lines: PurchaseLine[] = meals.map((m) => ({ name: `${m.slot}: ${m.deal.merchant} ${m.deal.name}`, qty: '1', pence: m.deal.pricePence, ref: ref(m.deal), ...(m.deal.condition ? { note: m.deal.condition } : {}) }));
    const total = lines.reduce((t, l) => t + l.pence, 0);
    const supermarket = meals.every((m) => SUPERMARKET.includes(m.deal.kind));
    return {
      id: `itin-life-${date}`, date, category: supermarket ? cats.groceries : cats.eatingOut, amount: gbp(total),
      label: label(meals), lines, source: 'itinerary', reason: lifestyle === 'brokie' ? 'Brokie mode: meal deals only' : `${lifestyle} lifestyle`,
    } satisfies PlannedPurchase;
  });
}

/** The day before the same date next year (a 12-month plan). */
export function yearEnd(today: ISODate): ISODate {
  const [y, m, d] = today.split('-').map(Number);
  const next = `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysInMonth(y + 1, m))).padStart(2, '0')}`;
  return addDays(next, -1);
}

export interface LifestyleNumbers {
  lifestyle: Lifestyle;
  monthlyIncomePence: number;
  monthlyRentPence: number;
  foodPerMonthPence: number;
  foodPerDayPence: number;
  /** Income − rent − food; negative = short every month. */
  savingsPerMonthPence: number;
  savingsPerYearPence: number;
  /** With the researched savings account: deposited monthly, interest compounded monthly. */
  savingsAccount?: { provider: string; product: string; ratePercent: number; ref: string; yearEndBalancePence: number; interestPence: number };
  /** The cheapest meal deal used (for "eat 2 of these a day"). */
  cheapestMealDeal: { merchant: string; name: string; pricePence: number; condition?: string; live: boolean };
  mealsPerDay: string;
  /** Food per month for every lifestyle, same prices (for comparisons). */
  foodPerMonthByLifestyle: Record<Lifestyle, number>;
}

const MEALS_PER_DAY: Record<Lifestyle, string> = {
  brokie: '2 meal deals a day, every day',
  balanced: 'a meal deal lunch and a cheap cooked dinner, takeaway on Fridays',
  comfy: 'coffee, lunch out on weekdays, cooked dinners, a takeaway Friday and dinner out on Saturday',
  baller: 'coffee and lunch out every day, takeaway Sun–Wed and dinner out Thu–Sat',
};

function foodPerMonth(menu: LifestyleMenu, lifestyle: Lifestyle, start: ISODate, end: ISODate): { total: number; days: number } {
  const by = dealsByKind(menu);
  const days = dateRange(start, end);
  const total = days.reduce((t, date, i) => t + mealsFor(lifestyle, dayOfWeek(date), i, by).reduce((s, m) => s + m.deal.pricePence, 0), 0);
  return { total, days: days.length };
}

/** Every figure the chat may quote. The plan runs 12 months, so per month = total / 12. */
export function lifestyleNumbers(menu: LifestyleMenu, lifestyle: Lifestyle, incomePence: number, rentPence: number, start: ISODate, end: ISODate): LifestyleNumbers {
  const { total, days } = foodPerMonth(menu, lifestyle, start, end);
  const food = Math.round(total / 12);
  const savings = incomePence - rentPence - food;
  const md = dealsByKind(menu).meal_deal[0];
  const byLifestyle = Object.fromEntries(LIFESTYLES.map((l) => [l, Math.round(foodPerMonth(menu, l, start, end).total / 12)])) as Record<Lifestyle, number>;
  let account: LifestyleNumbers['savingsAccount'];
  if (menu.savings && savings > 0) {
    let bal = 0;
    for (let m = 0; m < 12; m++) bal = (bal + savings) * (1 + menu.savings.ratePercent / 1200);
    const balance = Math.round(bal);
    account = { provider: menu.savings.provider, product: menu.savings.product, ratePercent: menu.savings.ratePercent, ref: menu.savings.ref, yearEndBalancePence: balance, interestPence: balance - savings * 12 };
  }
  return {
    lifestyle, monthlyIncomePence: incomePence, monthlyRentPence: rentPence,
    foodPerMonthPence: food, foodPerDayPence: Math.round(total / Math.max(1, days)),
    savingsPerMonthPence: savings, savingsPerYearPence: savings * 12,
    ...(account ? { savingsAccount: account } : {}),
    cheapestMealDeal: { merchant: md.merchant, name: md.name, pricePence: md.pricePence, ...(md.condition ? { condition: md.condition } : {}), live: md.origin === 'research' },
    mealsPerDay: MEALS_PER_DAY[lifestyle],
    foodPerMonthByLifestyle: byLifestyle,
  };
}
