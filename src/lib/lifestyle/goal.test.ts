import { describe, expect, it } from 'vitest';
import { applyIntent, generatePlan, previewIntent, type EngineState } from '@/lib/engine';
import { FALLBACK_DEALS } from './fallback';
import { planGoalPurchase } from './goal';
import { buildLifestylePlan } from './setup';
import type { Lifestyle } from './types';

const TODAY = '2026-10-31';

function planFor(lifestyle: Lifestyle): EngineState {
  const p = buildLifestylePlan({ monthlyIncomePence: 150000, monthlyRentPence: 90000, lifestyle, menu: { deals: FALLBACK_DEALS, live: false } }, TODAY);
  const s: EngineState = { schemaVersion: 1, profile: p.profile, commitments: p.commitments, incomes: [], ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null };
  s.plan = generatePlan(s, TODAY);
  const r = applyIntent(s, { kind: 'itinerary', idempotencyKey: 'i', purchases: p.purchases, mode: 'itemised' }, TODAY);
  if (!r.ok) throw new Error('itinerary failed');
  return r.nextState;
}

const total = (s: EngineState) => s.plannedPurchases.reduce((t, p) => t + p.amount.pence, 0);

describe('planGoalPurchase', () => {
  it.each(['brokie', 'comfy'] as const)('%s: re-plans many days, adds exactly the goal price, and the engine accepts it', (lifestyle) => {
    const s = planFor(lifestyle);
    const g = planGoalPurchase(s.plannedPurchases, { label: 'Basketball', amountPence: 2500, category: 'shopping' }, TODAY, s.profile.horizonEnd);
    if ('error' in g) throw new Error(g.error);
    expect(g.date).toBe('2026-11-14');
    expect(g.changes.length).toBeGreaterThan(3);
    // Cuts free money; the goal costs its price. Net: total spend moves by price − cuts.
    expect(g.purchases.reduce((t, p) => t + p.amount.pence, 0) - total(s)).toBe(2500 - g.cutPence);
    for (const p of g.purchases) if (p.lines) expect(p.lines.reduce((t, l) => t + l.pence, 0)).toBe(p.amount.pence);
    const pv = previewIntent(s, { kind: 'itinerary', idempotencyKey: 'g', purchases: g.purchases, mode: 'itemised' }, TODAY);
    expect(pv.ok).toBe(true);
    if (pv.ok) expect(new Set(pv.diff.changedDays)).toEqual(new Set(g.changes.map((c) => c.date)));
  });

  it('brokie has no treats to cut, so it sets a little aside every day', () => {
    const s = planFor('brokie');
    const g = planGoalPurchase(s.plannedPurchases, { label: 'Basketball', amountPence: 2500, category: 'shopping' }, TODAY, s.profile.horizonEnd);
    if ('error' in g) throw new Error(g.error);
    expect(g.cutPence).toBe(0);
    expect(g.setAsidePence).toBe(2500);
  });

  it('re-running the same goal replaces it instead of stacking', () => {
    const s = planFor('brokie');
    const goal = { label: 'Basketball', amountPence: 2500, category: 'shopping' };
    const g1 = planGoalPurchase(s.plannedPurchases, goal, TODAY, s.profile.horizonEnd);
    if ('error' in g1) throw new Error(g1.error);
    const g2 = planGoalPurchase(g1.purchases, goal, TODAY, s.profile.horizonEnd);
    if ('error' in g2) throw new Error(g2.error);
    expect(g2.purchases.reduce((t, p) => t + p.amount.pence, 0)).toBe(g1.purchases.reduce((t, p) => t + p.amount.pence, 0));
  });

  it('rejects dates outside the plan', () => {
    const s = planFor('brokie');
    expect(planGoalPurchase(s.plannedPurchases, { label: 'X', amountPence: 100, category: 'shopping', byDate: TODAY }, TODAY, s.profile.horizonEnd)).toHaveProperty('error');
  });
});
