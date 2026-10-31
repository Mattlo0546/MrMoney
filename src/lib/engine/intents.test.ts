import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertNumbersFromDiff } from './demo-journey.test';
import { protectedSnapshot } from './diff';
import { demoFixture } from './fixture';
import { affordability, applyIntent, previewIntent } from './intents';
import { checkInvariants } from './invariants';
import { gbp } from './money';
import { generatePlan } from './plan';
import { arbIntent, arbSpec, buildState, START } from './testkit';
import { commit, createUndoStack, undo } from './undo';
import type { ApplyResult, EngineState, Intent } from './types';

const T = '2026-11-10';
const ok = (r: ApplyResult) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r; };
const deepFreeze = <V>(o: V): V => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};

describe('random intent sequences (properties)', () => {
  it('I1 I2 I3 I6 hold after every applied intent; failures leave state untouched; I4 protected values move only by explicit intents', () => {
    fc.assert(fc.property(
      arbSpec.filter((g) => g.days >= 2),
      fc.array(fc.integer({ min: 0, max: 1e9 }), { minLength: 1, maxLength: 8 }),
      (g, seeds) => {
        let s: EngineState = buildState(g);
        s.plan = generatePlan(s, START);
        const cats = g.weights.length;
        seeds.forEach((seed, k) => {
          const intent = fc.sample(arbIntent(g.days, cats, k), { seed, numRuns: 1 })[0];
          const before = structuredClone(s);
          deepFreeze(s);
          const r = applyIntent(s, intent, START);
          expect(s).toEqual(before); // never mutates input
          if (!r.ok) return;
          expect(checkInvariants(r.nextState, START)).toEqual([]);
          const pb = protectedSnapshot(before, START), pa = protectedSnapshot(r.nextState, START);
          if (intent.kind === 'goal') {
            expect(pa.minimumReserve).toEqual(pb.minimumReserve);
            expect(pa.commitments).toEqual(pb.commitments);
            expect(pa.savingsGoal.pence).toBe(pb.savingsGoal.pence + intent.amount.pence);
          } else expect(pa).toEqual(pb);
          assertNumbersFromDiff(r.explanationFacts.sentence, r.diff); // I11
          s = r.nextState;
        });
      }), { numRuns: 200 });
  });
});

describe('I5 history before today is never changed', () => {
  it('rolling forward keeps past planned amounts and ledger entries; only future days move', () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'expense', amount: gbp(1200), date: T, category: 'groceries', idempotencyKey: 'a' }, T)).nextState;
    const later = '2026-11-12';
    const past = (s: EngineState) => s.plan!.allocations.filter((a) => a.day < later);
    // Record a forgotten expense for yesterday (11 Nov) on 12 Nov.
    const r = ok(applyIntent(s1, { kind: 'expense', amount: gbp(4000), date: '2026-11-11', category: 'eating-out', idempotencyKey: 'b' }, later));
    const pastBefore = past(s1).map((a) => [a.day, a.category, a.planned.pence]);
    const pastAfter = past(r.nextState).map((a) => [a.day, a.category, a.planned.pence]);
    expect(pastAfter).toEqual(pastBefore);
    expect(r.nextState.ledger.slice(0, 1)).toEqual(s1.ledger);
    expect(r.diff.cellChanges.filter((c) => c.field === 'planned').every((c) => c.day >= later)).toBe(true);
    expect(r.diff.overspend).toEqual(gbp(4000));
    expect(checkInvariants(r.nextState, later)).toEqual([]);
  });
  it('past-dated hypotheticals and bill changes are refused', () => {
    const { state } = demoFixture();
    const r = applyIntent(state, { kind: 'hypothetical', amount: gbp(100), date: '2026-11-09', category: 'shopping', idempotencyKey: 'x' }, T);
    expect(r.ok).toBe(false);
    const c = applyIntent(state, { kind: 'commitmentChange', change: { op: 'set', target: 'rent', amount: gbp(1), effectiveFrom: '2026-11-01' }, idempotencyKey: 'y' }, T);
    expect(c.ok === false && c.error?.code).toBe('out-of-range');
  });
});

describe('I6 no double counting', () => {
  it('an actual within the plan reduces what is left by exactly its amount and does not shrink the pool', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'expense', amount: gbp(500), date: T, category: 'groceries', idempotencyKey: 'g' }, T));
    const sum = (s: EngineState) => s.plan!.allocations.reduce((a, x) => a + x.planned.pence, 0);
    expect(sum(r.nextState)).toBe(sum(state));
    expect(r.nextState.plan!.summary.flexibleRemaining.pence).toBe(214_500 - 500);
    expect(r.nextState.plan!.summary.todayRemaining.pence).toBe(2584 - 500);
    expect(r.diff.overspend).toEqual(gbp(0));
    expect(r.diff.cellChanges.filter((c) => c.field === 'planned')).toEqual([]);
    expect(r.diff.changedDays).toEqual([T]); // only today's actual changed
    expect(r.explanationFacts.sentence).toContain("It fits in that day's allowance");
  });
  it("an actual in a day's planned purchase consumes it instead of adding to it", () => {
    const { state } = demoFixture();
    const s1 = ok(applyIntent(state, { kind: 'hypothetical', amount: gbp(2000), date: T, category: 'eating-out', idempotencyKey: 'h' }, T)).nextState;
    const r = ok(applyIntent(s1, { kind: 'expense', amount: gbp(2000), date: T, category: 'eating-out', idempotencyKey: 'e' }, T));
    expect(r.diff.overspend).toEqual(gbp(0));
    expect(r.nextState.plan!.summary.todayRemaining.pence).toBe(584);
  });
});

describe('I7 idempotency', () => {
  it('the same key twice gives the same state as once, with a no-op diff', () => {
    const { state } = demoFixture();
    const intents: Intent[] = [
      { kind: 'expense', amount: gbp(3500), date: T, category: 'household', idempotencyKey: 'k1' },
      { kind: 'income', amount: gbp(20000), date: T, idempotencyKey: 'k2' },
      { kind: 'goal', amount: gbp(1000), idempotencyKey: 'k3' },
      { kind: 'preference', amount: gbp(3000), date: '2026-11-14', idempotencyKey: 'k4' },
      { kind: 'hypothetical', amount: gbp(1000), date: '2026-11-12', category: 'shopping', idempotencyKey: 'k5' },
      { kind: 'commitmentChange', change: { op: 'add', name: 'Phone', amount: gbp(1500), recurrence: { kind: 'monthly', dayOfMonth: 20 } }, idempotencyKey: 'k6' },
    ];
    for (const it of intents) {
      const once = ok(applyIntent(state, it, T));
      const twice = ok(applyIntent(once.nextState, it, T));
      expect(twice.nextState).toEqual(once.nextState);
      expect(twice.diff.noop).toBe(true);
      expect(twice.diff.cellChanges).toEqual([]);
      expect(twice.nextState.ledger.filter((t) => t.idempotencyKey === it.idempotencyKey).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('I10 preview and undo', () => {
  it('previewIntent never mutates its (deep-frozen) input, for every intent kind', () => {
    const { state } = demoFixture();
    const copy = structuredClone(state);
    deepFreeze(state);
    const all: Intent[] = [
      { kind: 'expense', amount: gbp(3500), date: T, category: 'household', idempotencyKey: 'p1' },
      { kind: 'hypothetical', amount: gbp(6000), date: '2026-11-14', category: 'concert', idempotencyKey: 'p2' },
      { kind: 'hypothetical', amount: gbp(6000), date: '2026-11-14', category: 'concert', idempotencyKey: 'p2b', tradeoffOptionId: 'all-flexible-rest' },
      { kind: 'income', amount: gbp(20000), date: T, idempotencyKey: 'p3' },
      { kind: 'commitmentChange', change: { op: 'adjust', target: 'Rent', delta: gbp(5000), effectiveFrom: '2026-12-01' }, idempotencyKey: 'p4' },
      { kind: 'preference', amount: gbp(3000), date: '2026-11-14', idempotencyKey: 'p5' },
      { kind: 'goal', amount: gbp(10000), idempotencyKey: 'p6' },
      { kind: 'settingsEdit', patch: { minimumReserve: gbp(60000) }, idempotencyKey: 'p7' },
    ];
    for (const i of all) previewIntent(state, i, T);
    affordability(state, { amount: gbp(6000), date: '2026-11-14', category: 'concert' }, T);
    expect(state).toEqual(copy);
  });
  it('preview of a fitting hypothetical reports affordability; the committed state is the same as Apply', () => {
    const { state } = demoFixture();
    const i: Intent = { kind: 'hypothetical', amount: gbp(2000), date: '2026-11-11', category: 'eating-out', idempotencyKey: 'd' };
    const p = previewIntent(state, i, T);
    const a = applyIntent(state, i, T);
    expect(p.ok && a.ok && p.nextState).toEqual(a.ok && a.nextState);
    expect(p.affordability?.fits).toBe(true);
  });
  it('undo after any applied change restores the previous state deep-equal (property)', () => {
    fc.assert(fc.property(arbSpec.filter((g) => g.days >= 2), fc.integer({ min: 0, max: 1e9 }), (g, seed) => {
      const s = buildState(g);
      s.plan = generatePlan(s, START);
      const intent = fc.sample(arbIntent(g.days, g.weights.length, 0), { seed, numRuns: 1 })[0];
      const r = applyIntent(s, intent, START);
      if (!r.ok) return;
      const c = commit(createUndoStack(), s, r.nextState);
      expect(undo(c.stack)!.state).toEqual(s);
    }), { numRuns: 100 });
  });
});

describe('I4 protected values change only through explicit intents', () => {
  it('a settings edit changes the reserve and re-plans; an expense never does', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'settingsEdit', patch: { minimumReserve: gbp(60_000) }, idempotencyKey: 's' }, T));
    expect(r.nextState.profile.minimumReserve).toEqual(gbp(60_000));
    expect(r.diff.protectedUnchanged).toBe(false);
    expect(r.nextState.plan!.summary.flexibleRemaining.pence).toBe(214_500 - 10_000);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
    const huge = ok(applyIntent(state, { kind: 'expense', amount: gbp(500_000), date: T, category: 'household', idempotencyKey: 'h' }, T));
    expect(protectedSnapshot(huge.nextState, T)).toEqual(protectedSnapshot(state, T));
    expect(huge.nextState.plan!.fundingGap.pence).toBeGreaterThan(0);
  });
  it('removing a bill frees its money for later days', () => {
    const { state } = demoFixture();
    const r = ok(applyIntent(state, { kind: 'commitmentChange', change: { op: 'remove', target: 'utilities', effectiveFrom: '2026-12-01' }, idempotencyKey: 'u' }, T));
    expect(r.diff.commitment!.totalDelta).toEqual(gbp(-11_000));
    expect(r.nextState.plan!.summary.flexibleRemaining.pence).toBe(214_500 + 11_000);
    expect(r.diff.cellChanges.every((c) => c.day >= '2026-12-15')).toBe(true);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
});

describe('validation and clarification', () => {
  const { state } = demoFixture();
  it('asks about non-GBP currency instead of converting', () => {
    const r = applyIntent(state, { kind: 'expense', amount: { pence: 3500, currency: 'EUR' } as never, date: T, category: 'shopping', idempotencyKey: 'c' }, T);
    expect(r.ok === false && r.needsClarification?.field).toBe('amount');
  });
  it('asks about zero amounts, future-dated actuals and ambiguous bills', () => {
    expect(applyIntent(state, { kind: 'expense', amount: gbp(0), date: T, category: 'shopping', idempotencyKey: 'z' }, T)).toMatchObject({ ok: false, needsClarification: { field: 'amount' } });
    expect(applyIntent(state, { kind: 'expense', amount: gbp(10), date: '2026-11-12', category: 'shopping', idempotencyKey: 'f' }, T)).toMatchObject({ ok: false, needsClarification: { field: 'date' } });
    expect(applyIntent(state, { kind: 'commitmentChange', change: { op: 'adjust', target: 'gym', delta: gbp(10), effectiveFrom: '2026-12-01' }, idempotencyKey: 'g' }, T)).toMatchObject({ ok: false, needsClarification: { field: 'target' } });
  });
  it('refuses a goal larger than the flexible money, leaving state untouched', () => {
    const r = applyIntent(state, { kind: 'goal', amount: gbp(300_000), idempotencyKey: 'big' }, T);
    expect(r.ok === false && r.error?.code).toBe('insufficient-flexible');
  });
});
