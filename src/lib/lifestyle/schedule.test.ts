import { describe, expect, it } from 'vitest';
import { applyIntent, generatePlan, validateState, type EngineState } from '@/lib/engine';
import { FALLBACK_DEALS } from './fallback';
import { dealsByKind, lifestyleNumbers, lifestyleSchedule, mealsFor, yearEnd } from './schedule';
import type { FoodDeal, LifestyleMenu } from './types';
import { buildLifestylePlan } from './setup';

const menu: LifestyleMenu = { deals: FALLBACK_DEALS, live: false };
const TODAY = '2026-10-31';
const cats = { groceries: 'groceries', eatingOut: 'eating-out' };

describe('lifestyle schedule', () => {
  it('brokie eats two meal deals a day, every day, rotating the equally cheap ones', () => {
    const by = dealsByKind(menu);
    const days = [0, 1, 2].map((i) => mealsFor('brokie', 3, i, by));
    for (const d of days) expect(d.map((m) => m.deal.kind)).toEqual(['meal_deal', 'meal_deal']);
    // Tesco and Sainsbury's are both £3.85; Co-op's £4.00 is out.
    expect(new Set(days.flat().map((m) => m.deal.merchant))).toEqual(new Set(['Tesco', "Sainsbury's"]));
  });

  it('live research replaces the fallback for that kind', () => {
    const live: FoodDeal = { ...FALLBACK_DEALS[0], id: 'live-asda', merchant: 'Asda', pricePence: 350, origin: 'research', confidence: undefined };
    const by = dealsByKind({ deals: [live], live: true });
    expect(by.meal_deal.map((d) => d.id)).toEqual(['live-asda']);
    expect(by.coffee.length).toBeGreaterThan(0); // fallback still covers kinds research missed
  });

  it('one purchase per day for 12 months, lines add up', () => {
    const end = yearEnd(TODAY);
    expect(end).toBe('2027-10-30');
    const ps = lifestyleSchedule(menu, 'brokie', TODAY, end, cats);
    expect(ps).toHaveLength(365);
    expect(ps[0]).toMatchObject({ amount: { pence: 770 }, label: '2 meal deals', category: 'groceries', source: 'itinerary' });
    for (const p of ps) expect(p.lines!.reduce((t, l) => t + l.pence, 0)).toBe(p.amount.pence);
  });

  it('numbers: income − rent − food, a year of it, and interest at the researched rate', () => {
    const m: LifestyleMenu = { ...menu, savings: { ref: 'r-x-0', provider: 'Chip', product: 'Instant Access', ratePercent: 4.8, headline: '4.8% AER', sourceUrl: 'https://example.com' } };
    const n = lifestyleNumbers(m, 'brokie', 150000, 90000, TODAY, yearEnd(TODAY));
    expect(n.foodPerMonthPence).toBe(Math.round((770 * 365) / 12));
    expect(n.savingsPerMonthPence).toBe(150000 - 90000 - n.foodPerMonthPence);
    expect(n.savingsPerYearPence).toBe(n.savingsPerMonthPence * 12);
    expect(n.savingsAccount!.interestPence).toBeGreaterThan(0);
    expect(n.foodPerMonthByLifestyle.baller).toBeGreaterThan(n.foodPerMonthByLifestyle.brokie);
    expect(n.cheapestMealDeal.pricePence).toBe(385);
  });

  it('builds a valid itemised engine plan with the meals on the calendar', () => {
    const t0 = Date.now();
    const out = buildLifestylePlan({ monthlyIncomePence: 150000, monthlyRentPence: 90000, lifestyle: 'brokie', menu }, TODAY);
    const state: EngineState = {
      schemaVersion: 1, profile: out.profile, commitments: out.commitments, incomes: [], ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null,
    };
    expect(validateState(state)).toEqual({});
    state.plan = generatePlan(state, TODAY);
    const r = applyIntent(state, { kind: 'itinerary', idempotencyKey: 'k', purchases: out.purchases, mode: 'itemised' }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextState.plannedPurchases).toHaveLength(365);
    expect(r.nextState.plan!.deficits).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
