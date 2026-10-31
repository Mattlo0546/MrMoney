import { describe, expect, it } from 'vitest';
import { applyIntent, affordability, checkInvariants, demoFixture, ensurePlan, generatePlan, gbp, itineraryBudget } from './index';
import { poolFor as poolForTest } from './accounting';
import { assertExplanationFromDiff } from './testkit';
import type { EngineState, ItemRef, PlannedPurchase } from './types';

const ref: ItemRef = { id: 'r1', origin: 'research', merchant: 'Tesco', item: 'Eggs', sourceUrl: 'https://tesco.com/eggs', checked: '2026-11-10' };

const pp = (id: string, date: string, category: string, pence: number, extra: Partial<PlannedPurchase> = {}): PlannedPurchase => ({
  id, date, category, amount: gbp(pence), label: id, ...extra,
});

const itinerary = (key: string, purchases: PlannedPurchase[], mode: 'itemised' | 'even' = 'itemised') =>
  ({ kind: 'itinerary' as const, idempotencyKey: key, purchases, mode });

function dayTotals(s: EngineState, from: string) {
  const m = new Map<string, number>();
  for (const a of s.plan!.allocations) if (a.day >= from) m.set(a.day, (m.get(a.day) ?? 0) + a.planned.pence);
  return m;
}

function setup() {
  const { state, today } = demoFixture();
  const purchases = [
    pp('omelette', '2026-11-10', 'groceries', 450, { lines: [{ name: 'Eggs x6', pence: 195, ref }, { name: 'Cheese', pence: 255, ref }] }),
    pp('tube', '2026-11-11', 'transport', 560),
    pp('trainers', '2026-11-14', 'trainers', 4999, { reason: 'payday' }),
  ];
  const r = applyIntent(state, itinerary('it1', purchases), today);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { today, base: state, state: r.nextState, diff: r.diff, explanation: r.explanationFacts };
}

describe('itemised allocation', () => {
  it('day totals equal the planned purchases; the rest is unallocated buffer; I1 holds', () => {
    const { today, state } = setup();
    const totals = dayTotals(state, today);
    expect(totals.get('2026-11-10')).toBe(450);
    expect(totals.get('2026-11-11')).toBe(560);
    expect(totals.get('2026-11-14')).toBe(4999);
    expect(totals.get('2026-11-12')).toBe(0);
    expect(totals.get('2027-01-31')).toBe(0);
    const planned = [...totals.values()].reduce((a, b) => a + b, 0);
    expect(planned).toBe(450 + 560 + 4999);
    expect(state.plan!.unallocated.pence).toBe(poolForTest(state, today) - planned);
    expect(state.plan!.unallocatedReasons.join(' ')).toMatch(/isn't tied to a specific purchase yet — it stays as your buffer/);
    expect(state.plan!.fundingGap.pence).toBe(0);
    expect(state.plan!.deficits.filter((d) => d.kind === 'essentials')).toEqual([]);
    expect(checkInvariants(state, today)).toEqual([]);
    // generatePlan from scratch gives the same plan.
    expect(generatePlan(state, today).allocations).toEqual(state.plan!.allocations);
  });

  it('adds missing categories, sets mode, tags purchases and explains from the diff', () => {
    const { state, diff, explanation } = setup();
    expect(state.profile.allocationMode).toBe('itemised');
    const c = state.profile.categories.find((x) => x.id === 'trainers')!;
    expect(c).toMatchObject({ name: 'Trainers', weight: 0, priority: 5, essential: false });
    expect(state.plannedPurchases.every((x) => x.source === 'itinerary')).toBe(true);
    expect(diff.intentKind).toBe('itinerary');
    expect(diff.itinerary).toMatchObject({ purchases: 3, planned: gbp(6009), replaced: 0 });
    expect(explanation.sentence).toMatch(/^Applied your spending plan: 3 purchases, £60\.09 planned, £[\d,.]+ buffer\./);
    assertExplanationFromDiff(explanation, diff);
  });

  it('an expense comes out of the buffer, not other days', () => {
    const { today, state } = setup();
    const before = dayTotals(state, today);
    const r = applyIntent(state, { kind: 'expense', idempotencyKey: 'e1', amount: gbp(1200), date: today, category: 'eating-out' }, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = dayTotals(r.nextState, today);
    for (const [d, v] of before) if (d !== today) expect(after.get(d)).toBe(v);
    expect(after.get(today)).toBe(450 + 1200);
    expect(r.nextState.plan!.unallocated.pence).toBe(state.plan!.unallocated.pence - 1200);
    expect(r.diff.fromUnallocated).toEqual(gbp(1200));
    expect(r.diff.takenFromLater).toEqual(gbp(0));
    expect(r.diff.sources).toEqual([]);
    expect(checkInvariants(r.nextState, today)).toEqual([]);
    assertExplanationFromDiff(r.explanationFacts, r.diff);
    expect(r.explanationFacts.sentence).toMatch(/out of your buffer/);
  });

  it('an expense completing a planned purchase is covered by it', () => {
    const { today, state } = setup();
    const r = applyIntent(state, { kind: 'expense', idempotencyKey: 'e2', amount: gbp(400), date: today, category: 'groceries' }, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextState.ledger[0].plannedPurchaseId).toBe('omelette');
    expect(r.diff.absorbed).toEqual(gbp(400));
    expect(r.nextState.plan!.unallocated.pence).toBe(state.plan!.unallocated.pence + 50);
    expect(checkInvariants(r.nextState, today)).toEqual([]);
  });

  it('a hypothetical fits when it fits in the buffer, and is short otherwise', () => {
    const { today, state } = setup();
    const buffer = state.plan!.unallocated.pence;
    const ok = applyIntent(state, { kind: 'hypothetical', idempotencyKey: 'h1', amount: gbp(2000), date: '2026-11-20', category: 'eating-out', label: 'Dinner' }, today);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.nextState.plan!.unallocated.pence).toBe(buffer - 2000);
      expect(dayTotals(ok.nextState, today).get('2026-11-20')).toBe(2000);
      expect(checkInvariants(ok.nextState, today)).toEqual([]);
      assertExplanationFromDiff(ok.explanationFacts, ok.diff);
    }
    const aff = affordability(state, { amount: gbp(2000), date: '2026-11-20', category: 'eating-out' }, today);
    expect('fits' in aff && aff.fits).toBe(true);
    const tooBig = applyIntent(state, { kind: 'hypothetical', idempotencyKey: 'h2', amount: gbp(buffer + 1), date: '2026-11-20', category: 'eating-out' }, today);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error?.code).toBe('shortfall');
    const aff2 = affordability(state, { amount: gbp(buffer + 1), date: '2026-11-20', category: 'eating-out' }, today);
    expect('fits' in aff2 && !aff2.fits && aff2.shortfall).toBe(1);
  });

  it('other intents re-plan in full and keep the invariants', () => {
    const { today, state } = setup();
    const steps = [
      { kind: 'income' as const, idempotencyKey: 'i1', amount: gbp(5000), date: '2026-11-20' },
      { kind: 'goal' as const, idempotencyKey: 'g1', amount: gbp(1000) },
      { kind: 'preference' as const, idempotencyKey: 'p1', amount: gbp(1500), date: '2026-11-21' },
      { kind: 'removePlannedPurchase' as const, idempotencyKey: 'r1', plannedPurchaseId: 'tube' },
      { kind: 'commitmentChange' as const, idempotencyKey: 'c1', change: { op: 'adjust' as const, target: 'utilities', delta: gbp(500), effectiveFrom: today } },
      { kind: 'settingsEdit' as const, idempotencyKey: 's1', patch: { minimumReserve: gbp(40_000) } },
    ];
    let s = state;
    for (const intent of steps) {
      const r = applyIntent(s, intent, today);
      expect(r.ok, intent.kind).toBe(true);
      if (!r.ok) return;
      expect(r.diff.replanned, intent.kind).toBe(true);
      expect(checkInvariants(r.nextState, today), intent.kind).toEqual([]);
      assertExplanationFromDiff(r.explanationFacts, r.diff);
      s = r.nextState;
    }
    expect(dayTotals(s, today).get('2026-11-21')).toBe(1500);
    expect(dayTotals(s, today).get('2026-11-11')).toBe(0);
  });

  it('roll-forward to a new day re-plans in itemised mode', () => {
    const { state } = setup();
    const next = ensurePlan(state, '2026-11-12');
    expect(checkInvariants(next, '2026-11-12')).toEqual([]);
    expect(dayTotals(next, '2026-11-12').get('2026-11-14')).toBe(4999);
    expect(dayTotals(next, '2026-11-12').get('2026-11-13')).toBe(0);
  });

  it('a funding gap when purchases exceed the pool', () => {
    const { state, today } = demoFixture();
    const pool = poolForTest(state, today);
    const r = applyIntent(state, itinerary('big', [pp('laptop', '2026-11-12', 'tech', pool + 1000)]), today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextState.plan!.fundingGap.pence).toBe(1000);
    expect(r.nextState.plan!.unallocated.pence).toBe(0);
    expect(checkInvariants(r.nextState, today)).toEqual([]);
  });
});

describe('itinerary intent', () => {
  it('replaces earlier itinerary purchases but keeps other planned purchases', () => {
    const { today, base } = setup();
    const h = applyIntent(base, { kind: 'hypothetical', idempotencyKey: 'concert', amount: gbp(3000), date: '2026-11-14', category: 'eating-out', label: 'Concert' }, today);
    if (!h.ok) throw new Error('hypothetical failed');
    const a = applyIntent(h.nextState, itinerary('a', [pp('x1', '2026-11-12', 'groceries', 300), pp('x2', '2026-11-13', 'groceries', 300)]), today);
    if (!a.ok) throw new Error('a failed');
    const b = applyIntent(a.nextState, itinerary('b', [pp('y1', '2026-11-15', 'groceries', 700)]), today);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.nextState.plannedPurchases.map((x) => x.id).sort()).toEqual(['pp-concert', 'y1']);
    expect(b.diff.itinerary?.replaced).toBe(2);
    const t = dayTotals(b.nextState, today);
    expect(t.get('2026-11-12')).toBe(0);
    expect(t.get('2026-11-14')).toBe(3000);
    expect(t.get('2026-11-15')).toBe(700);
    expect(checkInvariants(b.nextState, today)).toEqual([]);
  });

  it('even mode keeps the purchases as earmarks inside an even plan', () => {
    const { today, state } = setup();
    const r = applyIntent(state, itinerary('even', [], 'even'), today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextState.profile.allocationMode).toBe('even');
    expect(r.nextState.plannedPurchases).toEqual([]);
    expect(r.nextState.plan!.unallocated.pence).toBe(0);
    expect(checkInvariants(r.nextState, today)).toEqual([]);
  });

  it('validates lines, dates, amounts and ids', () => {
    const { state, today } = demoFixture();
    const bad = (purchases: PlannedPurchase[]) => {
      const r = applyIntent(state, itinerary('bad', purchases), today);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error?.message ?? '';
    };
    expect(bad([pp('a', today, 'groceries', 500, { lines: [{ name: 'Eggs', pence: 195, ref }] })])).toMatch(/lines add up to 195p but the amount is 500p/);
    expect(bad([pp('a', '2026-11-09', 'groceries', 500)])).toMatch(/must be dated/);
    expect(bad([pp('a', '2027-02-01', 'groceries', 500)])).toMatch(/must be dated/);
    expect(bad([pp('a', today, 'groceries', -1)])).toMatch(/amount/);
    expect(bad([{ ...pp('a', today, 'groceries', 1), amount: { pence: 1.5, currency: 'GBP' } }])).toMatch(/amount/);
    expect(bad([pp('a', today, 'groceries', 1), pp('a', today, 'groceries', 2)])).toMatch(/more than once/);
  });

  it('is idempotent', () => {
    const { today, state } = setup();
    const again = applyIntent(state, itinerary('it1', [pp('z', today, 'groceries', 100)]), today);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.diff.noop).toBe(true);
    expect(again.nextState).toBe(state);
    expect(state.processedKeys).toContain('it1');
  });
});

describe('itineraryBudget', () => {
  it('is the pool minus non-itinerary uses, with non-decreasing cash caps', () => {
    const { today, state } = setup();
    const withConcert = applyIntent(state, { kind: 'hypothetical', idempotencyKey: 'c', amount: gbp(3000), date: '2026-11-20', category: 'eating-out' }, today);
    if (!withConcert.ok) throw new Error('failed');
    const s = withConcert.nextState;
    const b = itineraryBudget(s, today);
    expect(b.budgetPence).toBe(poolForTest(s, today) - 3000);
    expect(b.caps.length).toBe(83);
    expect(b.caps[b.caps.length - 1].cap).toBe(b.budgetPence);
    for (let i = 1; i < b.caps.length; i++) expect(b.caps[i].cap).toBeGreaterThanOrEqual(b.caps[i - 1].cap);
    expect(b.incomeDates).toEqual(['2026-12-18']);
    // Ignores the itinerary purchases already applied.
    expect(itineraryBudget(state, today).budgetPence).toBe(poolForTest(state, today));
  });
});
