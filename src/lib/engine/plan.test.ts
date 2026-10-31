import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { poolFor } from './accounting';
import { demoBaseState, demoFixture, DEMO_TODAY } from './fixture';
import { checkInvariants } from './invariants';
import { gbp } from './money';
import { generatePlan, EngineValidationError } from './plan';
import { arbSpec, buildState, START } from './testkit';
import type { EngineState } from './types';

const dayTotal = (s: EngineState, d: string) =>
  s.plan!.allocations.filter((a) => a.day === d).reduce((a, x) => a + x.planned.pence, 0);
const withPlan = (s: EngineState, today = START) => ({ ...s, plan: generatePlan(s, today) });

describe('generatePlan: properties over random profiles', () => {
  it('I1 I2 I3 hold for every generated plan', () => {
    fc.assert(fc.property(arbSpec, (g) => {
      const s = withPlan(buildState(g));
      expect(checkInvariants(s, START)).toEqual([]);
    }), { numRuns: 200 });
  });
  it('I8 deterministic, Σ planned = pool exactly, no negative allowance', () => {
    fc.assert(fc.property(arbSpec, (g) => {
      const s = buildState(g);
      const a = generatePlan(s, START), b = generatePlan(structuredClone(s), START);
      expect(a).toEqual(b);
      const P = poolFor(s, START);
      const sum = a.allocations.reduce((x, y) => x + y.planned.pence, 0);
      if (P >= 0) expect(sum + a.unallocated.pence).toBe(P);
      else { expect(sum).toBe(0); expect(a.fundingGap.pence).toBe(-P); }
      expect(a.allocations.every((x) => x.planned.pence >= 0)).toBe(true);
    }), { numRuns: 200 });
  });
  it('I8 without cash pressure: days differ by at most 1p, extra pence on the latest days', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2_000_000 }), fc.integer({ min: 1, max: 100 }), (funds, days) => {
      const s = buildState({ funds, monthly: false, days, reserve: 0, savings: 0, bills: [], incomes: [], weights: [3, 2], floors: [0, 0, 0, 0, 0] });
      const p = withPlan(s);
      const totals = [...new Set(p.plan.allocations.map((a) => a.day))].sort().map((d) => dayTotal(p, d));
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
      for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
    }));
  });
});

describe('demo fixture (I12)', () => {
  it('gives £25.84 a day: 214,500p = 83 × 2,584p + 28p on the last 28 days', () => {
    const { state, today } = demoFixture();
    expect(today).toBe('2026-11-10');
    expect(poolFor(state, today)).toBe(214_500);
    const days = [...new Set(state.plan!.allocations.map((a) => a.day))];
    expect(days).toHaveLength(83);
    expect(dayTotal(state, '2026-11-10')).toBe(2584);
    expect(dayTotal(state, '2027-01-03')).toBe(2584);
    expect(dayTotal(state, '2027-01-04')).toBe(2585);
    expect(dayTotal(state, '2027-01-31')).toBe(2585);
    const today0 = state.plan!.allocations.filter((a) => a.day === today).map((a) => [a.category, a.planned.pence]);
    expect(today0).toEqual([['groceries', 900], ['transport', 520], ['eating-out', 550], ['shopping', 614]]);
    expect(state.plan!.summary).toMatchObject({
      balance: gbp(390_000), reservedForCommitments: gbp(140_500), reserve: gbp(50_000), plannedSavings: gbp(15_000),
      flexibleRemaining: gbp(214_500), todayAllowance: gbp(2584), futureIncome: gbp(30_000),
    });
    expect(state.plan!.deficits).toEqual([]);
    expect(state.plan!.unallocated).toEqual(gbp(0));
    expect(checkInvariants(state, today)).toEqual([]);
  });
});

describe('I3 cash availability around the 18 Dec income', () => {
  const s0 = (): EngineState => {
    const s = demoBaseState();
    s.profile.funds = gbp(100_000); // £1,000 now
    s.profile.minimumReserve = gbp(0);
    s.profile.savingsGoal = gbp(0);
    s.commitments = [s.commitments[0]]; // rent £620 on 1 Dec and 1 Jan
    s.incomes = [{ id: 'x', amount: gbp(200_000), date: '2026-12-18', source: 'other', confirmed: true }];
    return s;
  };
  it('the window before the income is lower and never spends money that has not arrived', () => {
    const s = withPlan(s0(), DEMO_TODAY);
    // Before 18 Dec only £1,000 − £620 = £380 is spendable over 38 days = £10/day.
    expect(dayTotal(s, '2026-11-10')).toBe(1000);
    expect(dayTotal(s, '2026-12-17')).toBe(1000);
    let pre = 0;
    for (const a of s.plan!.allocations) if (a.day < '2026-12-18') pre += a.planned.pence;
    expect(pre).toBe(38_000);
    // After: (£1,000 + £2,000 − £1,240 − £380) over 45 days ≈ £30.67/day.
    expect(dayTotal(s, '2026-12-18')).toBeGreaterThan(3000);
    expect(checkInvariants(s, DEMO_TODAY)).toEqual([]);
  });
  it('unconfirmed income does not feed the plan', () => {
    const s = s0();
    s.incomes[0].confirmed = false;
    const p = withPlan(s, DEMO_TODAY);
    expect(p.plan!.allocations.reduce((a, x) => a + x.planned.pence, 0)).toBe(0);
    expect(p.plan!.deficits.some((d) => d.kind === 'bills-short')).toBe(true);
  });
  it('a bill due before the income it needs is reported as a cash-timing deficit', () => {
    const s = s0();
    s.profile.funds = gbp(50_000); // £500 cannot pay £620 rent on 1 Dec
    const p = withPlan(s, DEMO_TODAY);
    const items = p.plan!.deficits;
    expect(items[0]).toMatchObject({ kind: 'bills-short', date: '2026-12-01', amount: gbp(12_000) });
    expect(dayTotal(p, '2026-11-20')).toBe(0); // no allowance while the bill is uncovered
    expect(checkInvariants(p, DEMO_TODAY)).toEqual([]);
  });
});

describe('deficits, unallocated, validation, monthly mode', () => {
  it('essentials that cannot be covered give an explicit deficit, never a negative allowance', () => {
    const s = demoBaseState();
    s.profile.categories[0].minimumDaily = gbp(2000);
    s.profile.categories[1].minimumDaily = gbp(1000);
    const p = withPlan(s, DEMO_TODAY);
    const ess = p.plan!.deficits.find((d) => d.kind === 'essentials')!;
    expect(ess.amount.pence).toBe(83 * 3000 - 214_500);
    expect(p.plan!.allocations.every((a) => a.planned.pence >= 0)).toBe(true);
  });
  it('protected items above the funds: savings unfunded first, then reserve', () => {
    const s = demoBaseState();
    s.profile.funds = gbp(200_000);
    const p = withPlan(s, DEMO_TODAY);
    expect(p.plan!.fundingGap.pence).toBe(0);
    const s2 = demoBaseState();
    s2.profile.funds = gbp(150_000);
    const p2 = withPlan(s2, DEMO_TODAY);
    expect(p2.plan!.fundingGap.pence).toBe(140_500 + 65_000 - 180_000);
    expect(p2.plan!.deficits[0]).toMatchObject({ kind: 'savings-unfunded', amount: gbp(15_000) });
    expect(p2.plan!.summary.plannedSavings.pence).toBe(0);
    expect(checkInvariants(p2, DEMO_TODAY)).toEqual([]);
  });
  it('reports unallocated money when the plan has ended', () => {
    const s = demoFixture().state;
    const p = generatePlan(s, '2027-02-01');
    expect(p.unallocated.pence).toBe(214_500);
    expect(p.unallocatedReasons[0]).toMatch(/not assigned/);
  });
  it('monthly allowance arrives as income on its date and cannot be spent early', () => {
    const s = demoBaseState();
    s.profile.fundsType = 'monthly';
    s.profile.funds = gbp(100_000);
    s.profile.allowanceDay = 1;
    s.profile.openingBalance = gbp(30_000);
    s.profile.minimumReserve = gbp(0);
    s.profile.savingsGoal = gbp(0);
    s.commitments = [];
    s.incomes = [];
    const p = withPlan(s, DEMO_TODAY);
    let beforeDec = 0;
    for (const a of p.plan!.allocations) if (a.day < '2026-12-01') beforeDec += a.planned.pence;
    expect(beforeDec).toBeLessThanOrEqual(30_000);
    expect(p.plan!.allocations.reduce((a, x) => a + x.planned.pence, 0)).toBe(230_000);
    expect(checkInvariants(p, DEMO_TODAY)).toEqual([]);
  });
  it('invalid input creates no plan and returns field errors', () => {
    const s = demoBaseState();
    s.profile.horizonEnd = '2026-10-01';
    s.profile.categories = [];
    expect(() => generatePlan(s, DEMO_TODAY)).toThrow(EngineValidationError);
    try { generatePlan(s, DEMO_TODAY); } catch (e) {
      expect(Object.keys((e as EngineValidationError).fieldErrors)).toEqual(expect.arrayContaining(['horizonEnd', 'categories']));
    }
  });
  it('changing the end date changes the daily amount', () => {
    const s = demoBaseState();
    s.profile.horizonEnd = '2026-12-31';
    const p = withPlan(s, DEMO_TODAY);
    expect(dayTotal(p, DEMO_TODAY)).not.toBe(2584);
  });
});
