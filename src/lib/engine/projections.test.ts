import { describe, expect, it } from 'vitest';
import { demoFixture } from './fixture';
import { applyIntent } from './intents';
import { gbp } from './money';
import { project, type ProjectionAssumptions } from './projections';

const base: ProjectionAssumptions = {
  startSavings: gbp(20_000),
  startInvestments: gbp(0),
  monthlySavingsContribution: gbp(5_000),
  monthlyInvestmentContribution: gbp(2_000),
  confirmedIncome: gbp(30_000),
  expectedMonthlyIncome: gbp(25_000),
  savingsRatePct: { low: 2, base: 3.5, high: 4.5 },
  investmentReturnPct: { low: 0, base: 4, high: 7 },
};

describe('projections (monthly compounding, user-entered rates)', () => {
  it('matches design spec §7 to the penny after 12 months', () => {
    const r = project(base, 12);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.label).toBe('Projection, not advice or a guarantee');
    const last = (s: 'low' | 'base' | 'high') => r.scenarios[s]![12];
    expect([last('low').savings.pence, last('base').savings.pence, last('high').savings.pence]).toEqual([80_957, 81_683, 82_172]);
    expect([last('low').investments.pence, last('base').investments.pence, last('high').investments.pence]).toEqual([24_000, 24_445, 24_785]);
    expect([last('low').total.pence, last('base').total.pence, last('high').total.pence]).toEqual([104_957, 106_128, 106_957]);
    expect(last('base').contributed).toEqual(gbp(104_000));
    expect(last('base').cumulativeIncome).toEqual(gbp(330_000));
    expect(r.scenarios.base).toHaveLength(13);
  });
  it('returns needs-rates when rates are empty (no defaults are invented)', () => {
    const r = project({ ...base, savingsRatePct: {}, investmentReturnPct: {} }, 12);
    expect(r).toEqual({ status: 'needs-rates', missing: expect.arrayContaining(['savingsRatePct.base', 'investmentReturnPct.low']) });
  });
  it('computes only scenarios that have rates, and lists the missing ones', () => {
    const r = project({ ...base, savingsRatePct: { base: 3.5 }, investmentReturnPct: { base: 4 } }, 6);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(Object.keys(r.scenarios)).toEqual(['base']);
      expect(r.missing).toContain('savingsRatePct.low');
    }
  });
  it('changing a rate or the period changes the figures', () => {
    const a = project(base, 12), b = project({ ...base, savingsRatePct: { ...base.savingsRatePct, base: 5 } }, 12), c = project(base, 24);
    if (a.status !== 'ok' || b.status !== 'ok' || c.status !== 'ok') throw new Error();
    expect(b.scenarios.base![12].savings.pence).toBeGreaterThan(a.scenarios.base![12].savings.pence);
    expect(c.scenarios.base![24].cumulativeIncome.pence).toBe(30_000 + 25_000 * 24);
  });
  it('rejects invalid periods', () => {
    expect(project(base, 0).status).toBe('invalid');
  });
});

describe('performance', () => {
  it('re-planning the 83-day fixture takes well under 1 s', () => {
    const { state, today } = demoFixture();
    const t0 = performance.now();
    for (let i = 0; i < 20; i++)
      applyIntent(state, { kind: 'expense', amount: gbp(3500 + i), date: today, category: 'household', idempotencyKey: `p${i}` }, today);
    expect((performance.now() - t0) / 20).toBeLessThan(1000);
  });
});
