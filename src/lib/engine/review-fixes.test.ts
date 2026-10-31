/** Regression tests for D16 and the independent engine review findings. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { demoBaseState, demoFixture } from './fixture';
import { affordability, applyIntent, ensurePlan, type Affordability } from './intents';
import { checkInvariants } from './invariants';
import { gbp, MAX_PENCE } from './money';
import { generatePlan } from './plan';
import { project } from './projections';
import { addDays } from './dates';
import { arbSpec, assertExplanationFromDiff, buildState, START } from './testkit';
import type { ApplyResult, EngineState } from './types';

const T = '2026-11-10';
const ok = (r: ApplyResult) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r; };
const cells = (s: EngineState, d: string) =>
  Object.fromEntries(s.plan!.allocations.filter((a) => a.day === d).map((a) => [a.category, a.planned.pence]));
const total = (s: EngineState, d: string) => Object.values(cells(s, d)).reduce((a, b) => a + b, 0);

describe('D16 essential floors and borrowing', () => {
  it('overspend reallocation never takes groceries or transport below their floors', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'expense', amount: gbp(50_000), date: T, category: 'household', idempotencyKey: 'x' }, T));
    expect(r.diff.uncovered).toEqual(gbp(0));
    for (const a of r.nextState.plan!.allocations.filter((x) => x.day > T)) {
      if (a.category === 'groceries') expect(a.planned.pence).toBeGreaterThanOrEqual(900);
      if (a.category === 'transport') expect(a.planned.pence).toBeGreaterThanOrEqual(520);
    }
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
  it('borrowing takes at most half of a later day\'s non-essential cell and only within 7 days', () => {
    const { state } = demoFixture();
    const a = affordability(state, { amount: gbp(4000), date: '2026-11-12', category: 'eating-out' }, T) as Affordability;
    expect(a.fits).toBe(true);
    if (!a.fits) return;
    const s = a.preview.nextState;
    for (const d of ['2026-11-13', '2026-11-19']) expect(cells(s, d).shopping).toBeGreaterThanOrEqual(307);
    expect(cells(s, '2026-11-20')).toEqual(cells(state, '2026-11-20'));
    expect(a.borrowing!.from).toBe('2026-11-13');
    expect(a.borrowing!.to).toBe('2026-11-19');
    expect(cells(s, '2026-11-12')).toMatchObject({ groceries: 900, transport: 520 });
  });
});

describe('finding 1: expense explanation states what was and was not covered', () => {
  it('£2,400 tuition today: takenFromLater + uncovered = overspend and the sentence says so', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'expense', amount: gbp(240_000), date: T, category: 'tuition', idempotencyKey: 't' }, T));
    const d = r.diff;
    expect(d.takenFromLater!.pence + d.uncovered!.pence + (d.fromUnallocated?.pence ?? 0)).toBe(d.overspend!.pence);
    expect(d.uncovered!.pence).toBe(r.nextState.plan!.fundingGap.pence);
    expect(d.uncovered!.pence).toBeGreaterThan(0);
    expect(r.explanationFacts.sentence).toMatch(/comes from later days; £[\d,.]+ couldn't be covered\./);
    assertExplanationFromDiff(r.explanationFacts, d);
  });
});

describe('finding 2: protected snapshot reports funding honestly', () => {
  it('a big expense makes the savings goal unfunded; it is not called unchanged', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'expense', amount: gbp(220_000), date: T, category: 'x', idempotencyKey: 'x' }, T));
    expect(r.diff.protectedBefore.plannedSavings).toEqual(gbp(15_000));
    expect(r.diff.protectedAfter.plannedSavings!.pence).toBeLessThan(15_000);
    expect(r.diff.protectedUnchanged).toBe(false);
    expect(r.explanationFacts.sentence).not.toContain('savings goal are unchanged');
    expect(r.explanationFacts.sentence).toMatch(/savings goal (can no longer be funded|is funded now)/);
    assertExplanationFromDiff(r.explanationFacts, r.diff);
  });
});

describe('finding 3: a planned purchase after a same-cell actual is earmarked', () => {
  it('£10 eating out actual, then a £10 eating-out planned purchase: both count', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'expense', amount: gbp(1000), date: T, category: 'eating-out', idempotencyKey: 'a' }, T)).nextState;
    expect(s1.plan!.summary.todayRemaining).toEqual(gbp(1584));
    const r = ok(applyIntent(s1, { kind: 'hypothetical', amount: gbp(1000), date: T, category: 'eating-out', idempotencyKey: 'b' }, T));
    expect(r.nextState.plan!.summary.earmarked).toEqual(gbp(1000));
    // The earmark adds to the actual: eating out holds £10 spent + £10 set aside.
    expect(cells(r.nextState, T)['eating-out']).toBe(2000);
    expect(r.nextState.plan!.summary.todayRemaining).toEqual(gbp(1420));
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
});

describe('finding 4: planned purchases are released by a linked actual or removed', () => {
  const setup = () => {
    const { state } = demoFixture();
    return ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(2000), date: T, category: 'eating-out', label: 'Dinner', idempotencyKey: 'a' }, T)).nextState;
  };
  it('an actual in another category matching the label completes it (no double count)', () => {
    const r = ok(applyIntent(setup(), { kind: 'expense', amount: gbp(2000), date: T, category: 'dinner', idempotencyKey: 'b' }, T));
    expect(r.nextState.ledger[0].plannedPurchaseId).toBe('pp-a');
    expect(r.diff.overspend).toEqual(gbp(0));
    expect(r.nextState.plan!.summary.earmarked).toEqual(gbp(0));
    expect(r.nextState.plan!.summary.flexibleRemaining).toEqual(gbp(212_500));
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
  it('an explicit plannedPurchaseId links an actual on an earlier day; its money is used first', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(2000), date: '2026-11-14', category: 'eating-out', label: 'Gig', idempotencyKey: 'g' }, T)).nextState;
    const r = ok(applyIntent(s1, { kind: 'expense', amount: gbp(4584), date: T, category: 'tickets', plannedPurchaseId: 'pp-g', idempotencyKey: 'e' }, T));
    expect(r.nextState.plan!.summary.earmarked).toEqual(gbp(0));
    expect(r.diff.takenFromLater).toEqual(gbp(2000));
    expect(r.diff.sources).toEqual([expect.objectContaining({ category: 'eating-out', days: ['2026-11-14'] })]);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
    const bad = applyIntent(s1, { kind: 'expense', amount: gbp(100), date: T, category: 'x', plannedPurchaseId: 'nope', idempotencyKey: 'n' }, T);
    expect(bad.ok === false && bad.error?.code).toBe('not-found');
  });
  it('removePlannedPurchase releases the earmark; non-spending category money goes back to the day', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(2000), date: '2026-11-14', category: 'concert', label: 'Gig', idempotencyKey: 'g' }, T)).nextState;
    const r = ok(applyIntent(s1, { kind: 'removePlannedPurchase', label: 'gig', idempotencyKey: 'rm' }, T));
    expect(r.nextState.plannedPurchases).toEqual([]);
    expect(r.nextState.plan!.summary.earmarked).toEqual(gbp(0));
    expect(cells(r.nextState, '2026-11-14').concert).toBe(0);
    expect(total(r.nextState, '2026-11-14')).toBe(total(s1, '2026-11-14'));
    expect(r.explanationFacts.sentence).toContain('Removed the £20 planned purchase (Gig, 14 Nov)');
    assertExplanationFromDiff(r.explanationFacts, r.diff);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
    expect(applyIntent(s1, { kind: 'removePlannedPurchase', plannedPurchaseId: 'x', idempotencyKey: 'r2' }, T)).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

describe('finding 5: late requests get options from earlier days', () => {
  it('a £60 request on the last day of the plan offers the earlier-days option', () => {
    const { state } = demoFixture();
    const a = affordability(state, { amount: gbp(6000), date: '2027-01-31', category: 'concert' }, T) as Affordability;
    expect(a.fits).toBe(false);
    if (a.fits) return;
    const o = a.options.find((x) => x.id === 'earlier-days')!;
    expect(o).toBeDefined();
    expect(o.sources.reduce((s, x) => s + x.amount, 0)).toBe(a.shortfall);
    expect(o.sources.every((x) => x.from >= '2026-11-11' && x.to <= '2027-01-30')).toBe(true);
    expect(checkInvariants(o.preview.nextState, T)).toEqual([]);
  });
});

describe('finding 6: affordability is idempotent and never duplicates ids', () => {
  it('the same request twice gets distinct ids; a processed key returns an already-applied no-op', () => {
    const { state } = demoFixture();
    const r = { amount: gbp(1000), date: '2026-11-12', category: 'eating-out' };
    const a = affordability(state, r, T) as Affordability;
    const s1 = a.fits ? a.preview.nextState : state;
    const a2 = affordability(s1, r, T) as Affordability;
    expect(a2.fits).toBe(true);
    const ids = a2.fits ? a2.preview.nextState.plannedPurchases.map((p) => p.id) : [];
    expect(new Set(ids).size).toBe(2);
    const k = { ...r, idempotencyKey: 'k1' };
    const b = affordability(state, k, T) as Affordability;
    const b2 = affordability(b.fits ? b.preview.nextState : state, k, T) as Affordability;
    expect(b2).toMatchObject({ fits: true, alreadyApplied: true });
    expect(b2.fits && b2.preview.diff.noop).toBe(true);
    expect(b2.fits && b2.preview.nextState.plannedPurchases.length).toBe(1);
  });
});

describe('finding 7: rolling forward keeps earlier reallocations', () => {
  it('a trade-off placement survives the next day', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(6000), date: '2026-11-14', category: 'concert', idempotencyKey: 'h', tradeoffOptionId: 'shopping-later' }, T)).nextState;
    const s2 = ensurePlan(s1, '2026-11-11');
    expect(cells(s2, '2026-11-14').concert).toBe(6000);
    expect(s2.plan!.summary.earmarked).toEqual(gbp(6000));
    // 15 Nov kept its reduced shopping, plus its share of yesterday's unspent money.
    expect(cells(s2, '2026-11-15').shopping).toBeLessThan(cells(s2, '2026-12-01').shopping);
    expect(checkInvariants(s2, '2026-11-11')).toEqual([]);
  });
  it('random sequences with advancing days keep invariants and history (property)', () => {
    fc.assert(fc.property(arbSpec.filter((g) => g.days >= 5), fc.array(fc.record({
      adv: fc.integer({ min: 0, max: 3 }), kind: fc.integer({ min: 0, max: 2 }), amt: fc.integer({ min: 1, max: 40_000 }), off: fc.integer({ min: 0, max: 20 }),
    }), { minLength: 1, maxLength: 6 }), (g, steps) => {
      let s = buildState(g);
      let today = START;
      s.plan = generatePlan(s, today);
      steps.forEach((st, k) => {
        today = addDays(today, st.adv);
        if (today > s.profile.horizonEnd) return;
        const d = addDays(today, st.off);
        const intents = [
          { kind: 'expense' as const, amount: gbp(st.amt), date: today, category: 'c0', idempotencyKey: `k${k}` },
          { kind: 'hypothetical' as const, amount: gbp(st.amt), date: d > s.profile.horizonEnd ? today : d, category: `c${g.weights.length - 1}`, idempotencyKey: `k${k}`, tradeoffOptionId: 'all-flexible-rest' },
          { kind: 'income' as const, amount: gbp(st.amt), date: d, idempotencyKey: `k${k}` },
        ];
        const prevPast = s.plan!.allocations.filter((a) => a.day < today).map((a) => [a.day, a.category, a.planned.pence]);
        const r = applyIntent(s, intents[st.kind], today);
        if (!r.ok) return;
        expect(checkInvariants(r.nextState, today)).toEqual([]);
        expect(r.nextState.plan!.allocations.filter((a) => a.day < today).map((a) => [a.day, a.category, a.planned.pence])).toEqual(prevPast);
        s = r.nextState;
      });
    }), { numRuns: 150 });
  }, 60_000);
});

describe('finding 8: savings are held by the end of the plan, the reserve from today', () => {
  it('a cash-tight start still gets an allowance before the income', () => {
    const s = demoBaseState();
    s.profile.funds = gbp(70_000); s.profile.minimumReserve = gbp(0); s.profile.savingsGoal = gbp(15_000);
    s.commitments = [s.commitments[0]];
    s.incomes = [{ id: 'x', amount: gbp(200_000), date: '2026-12-18', source: 'other', confirmed: true }];
    s.plan = generatePlan(s, T);
    expect(total(s, T)).toBeGreaterThan(0);
    expect(checkInvariants(s, T)).toEqual([]);
  });
});

describe('finding 11: cash repair keeps today and essentials', () => {
  it('a goal in a cash-tight plan does not change today or cut groceries', () => {
    const s = demoBaseState();
    s.profile.funds = gbp(100_000); s.profile.minimumReserve = gbp(0); s.profile.savingsGoal = gbp(0);
    s.profile.categories = s.profile.categories.map((c) => ({ ...c, minimumDaily: undefined })); // the reviewer's repro had no floors
    s.commitments = [s.commitments[0]];
    s.incomes = [{ id: 'x', amount: gbp(200_000), date: '2026-12-18', source: 'other', confirmed: true }];
    s.plan = generatePlan(s, T);
    const r = ok(applyIntent(s, { kind: 'goal', amount: gbp(5000), idempotencyKey: 'g' }, T));
    expect(r.diff.replanned).toBe(false);
    expect(cells(r.nextState, T)).toEqual(cells(s, T));
    expect(r.diff.sources.map((x) => x.category)).not.toContain('groceries');
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
});

describe('finding 12: huge amounts are refused, never thrown', () => {
  it('amounts above £10m return an out-of-range error', () => {
    const { state } = demoFixture();
    for (const p of [MAX_PENCE + 1, 4e15, Number.MAX_SAFE_INTEGER]) {
      expect(() => applyIntent(state, { kind: 'income', amount: gbp(p), date: T, idempotencyKey: `i${p}` }, T)).not.toThrow();
      expect(applyIntent(state, { kind: 'income', amount: gbp(p), date: T, idempotencyKey: `i${p}` }, T)).toMatchObject({ ok: false, error: { code: 'out-of-range' } });
      expect(applyIntent(state, { kind: 'expense', amount: gbp(p), date: T, category: 'x', idempotencyKey: `e${p}` }, T)).toMatchObject({ ok: false, error: { code: 'out-of-range' } });
    }
    expect(applyIntent(state, { kind: 'income', amount: gbp(MAX_PENCE), date: T, idempotencyKey: 'max' }, T).ok).toBe(true);
  });
});

describe('finding 14: settingsEdit accepts only known keys', () => {
  it('rejects unknown keys and allows funds / fundsType', () => {
    const { state } = demoFixture();
    const bad = applyIntent(state, { kind: 'settingsEdit', patch: { planStart: '2020-01-01' } as never, idempotencyKey: 's' }, T);
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid' } });
    const r = ok(applyIntent(state, { kind: 'settingsEdit', patch: { funds: gbp(400_000) } as never, idempotencyKey: 'f' }, T));
    expect(r.nextState.profile.funds).toEqual(gbp(400_000));
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
  it('refuses to shorten the plan past a planned purchase', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(2000), date: '2027-01-20', category: 'eating-out', idempotencyKey: 'h' }, T)).nextState;
    expect(applyIntent(s1, { kind: 'settingsEdit', patch: { horizonEnd: '2027-01-10' }, idempotencyKey: 's' }, T)).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });
});

describe('finding 15: goal.byDate is honoured', () => {
  it('the extra savings come only from days up to the date and are held from then on', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'goal', amount: gbp(10_000), byDate: '2026-11-20', idempotencyKey: 'g' }, T));
    expect(r.diff.cellChanges.every((c) => c.day <= '2026-11-20')).toBe(true);
    expect(r.diff.savingsGoal?.byDate).toBe('2026-11-20');
    expect(checkInvariants(r.nextState, T)).toEqual([]);
    expect(applyIntent(state, { kind: 'goal', amount: gbp(100), byDate: T, idempotencyKey: 'g2' }, T)).toMatchObject({ ok: false, error: { code: 'out-of-range' } });
  });
});

describe('after the plan ends', () => {
  it('an expense is paid from unassigned money and later income keeps I6', () => {
    const { state } = demoFixture();
    const t = '2027-02-02';
    const r1 = ok(applyIntent(state, { kind: 'expense', amount: gbp(1000), date: t, category: 'shopping', idempotencyKey: 'a' }, t));
    expect(r1.nextState.plan!.fundingGap).toEqual(gbp(0));
    expect(r1.diff.fromUnallocated).toEqual(gbp(1000));
    expect(checkInvariants(r1.nextState, t)).toEqual([]);
    const r2 = ok(applyIntent(r1.nextState, { kind: 'income', amount: gbp(500), date: t, idempotencyKey: 'b' }, t));
    expect(checkInvariants(r2.nextState, t)).toEqual([]);
  });
});

describe('projections', () => {
  it('each point carries growth = total − contributed', () => {
    const r = project({
      startSavings: gbp(10_000), startInvestments: gbp(0), monthlySavingsContribution: gbp(1000), monthlyInvestmentContribution: gbp(0),
      savingsRatePct: { low: 2, base: 4, high: 5 }, investmentReturnPct: { low: null, base: null, high: null },
      confirmedIncome: gbp(0), expectedMonthlyIncome: gbp(0),
    } as never, 12);
    if (r.status !== 'ok') throw new Error(r.status);
    for (const p of r.scenarios.base!) expect(p.growth!.pence).toBe(p.total.pence - p.contributed.pence);
  });
});

describe('borrowing never spends money before it arrives', () => {
  it('a request the day before an income gets an answer (fits or shortfall), never a cash-constraint error', () => {
    for (const floors of [true, false])
      for (const amount of [3000, 6000, 20_000]) {
        const s = demoBaseState();
        s.profile.funds = gbp(100_000); s.profile.minimumReserve = gbp(0); s.profile.savingsGoal = gbp(0);
        if (!floors) s.profile.categories = s.profile.categories.map((c) => ({ ...c, minimumDaily: undefined }));
        s.commitments = [s.commitments[0]];
        s.incomes = [{ id: 'x', amount: gbp(200_000), date: '2026-12-18', source: 'other', confirmed: true }];
        s.plan = generatePlan(s, T);
        const a = affordability(s, { amount: gbp(amount), date: '2026-12-17', category: 'gift' }, T) as Affordability;
        expect('fits' in a, JSON.stringify(a)).toBe(true);
        const previews = a.fits ? [a.preview] : a.options.map((o) => o.preview);
        for (const p of previews) expect(checkInvariants(p.nextState, T)).toEqual([]);
        if (!a.fits) expect(a.amount - a.dayRemaining - (a.borrowable ?? 0)).toBe(a.shortfall);
      }
  });
});
