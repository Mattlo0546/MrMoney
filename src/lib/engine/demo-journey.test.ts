/**
 * Scripted R-demo journey on the fixture (brief open decision 4, design spec §7).
 * Exact figures are documented in README.md.
 */
import { describe, expect, it } from 'vitest';
import { demoFixture } from './fixture';
import { affordability, applyIntent, previewIntent, type Affordability } from './intents';
import { checkInvariants } from './invariants';
import { formatMoney, gbp } from './money';
import { createUndoStack, commit, undo } from './undo';
import type { ApplyResult, ChangeSet, EngineState, HypotheticalIntent, Intent } from './types';

const T = '2026-11-10';
const cells = (s: EngineState, d: string) =>
  Object.fromEntries(s.plan!.allocations.filter((a) => a.day === d).map((a) => [a.category, a.planned.pence]));
const total = (s: EngineState, d: string) => Object.values(cells(s, d)).reduce((a, b) => a + b, 0);
function ok(r: ApplyResult) {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
}

/** Every £ figure in a sentence must be a Money value somewhere in the diff (I11). */
export function moneyIn(diff: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown) => {
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o.currency === 'GBP' && typeof o.pence === 'number') out.add(formatMoney(o.pence as number));
      Object.values(o).forEach(walk);
    }
  };
  walk(diff);
  return out;
}
export function assertNumbersFromDiff(sentence: string, diff: ChangeSet) {
  const nums = sentence.match(/-?£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
  const allowed = moneyIn(diff);
  for (const n of nums) expect(allowed, `${n} in "${sentence}"`).toContain(n);
}

const S1: Intent = { kind: 'expense', amount: gbp(3500), date: T, category: 'household', note: 'Shower filter', idempotencyKey: 's1' };
const S2: HypotheticalIntent = { kind: 'hypothetical', amount: gbp(2000), date: '2026-11-11', category: 'eating-out', label: 'Dinner', idempotencyKey: 's2' };
const S3 = (opt?: string): HypotheticalIntent => ({ kind: 'hypothetical', amount: gbp(6000), date: '2026-11-14', category: 'concert', label: 'Concert ticket', idempotencyKey: 's3', tradeoffOptionId: opt });
const S4: Intent = { kind: 'income', amount: gbp(20000), date: T, note: 'Extra', idempotencyKey: 's4' };

describe('demo journey', () => {
  const { state: s0 } = demoFixture();
  let stack = createUndoStack();

  // S1
  const r1 = ok(applyIntent(s0, S1, T));
  const s1 = r1.nextState;
  it('S1: £35 actual uses today\'s £25.84; £9.16 overspend comes from shopping on later days', () => {
    expect(r1.diff.absorbed).toEqual(gbp(2584));
    expect(r1.diff.overspend).toEqual(gbp(916));
    expect(r1.diff.sources).toEqual([expect.objectContaining({ category: 'shopping', amount: gbp(916) })]);
    expect(r1.diff.sources[0].days).toHaveLength(82);
    expect(cells(s1, T)).toEqual({ groceries: 0, transport: 0, 'eating-out': 0, shopping: 0, household: 3500 });
    // −11p a day on 11 Nov – 17 Jan, −12p on the last 14 days (82×11 + 14 = 916).
    expect(cells(s1, '2026-11-11').shopping).toBe(603);
    expect(total(s1, '2026-11-14')).toBe(2573);
    expect(total(s1, '2027-01-10')).toBe(2574);
    expect(total(s1, '2027-01-31')).toBe(2573);
    expect(s1.plan!.summary).toMatchObject({
      balance: gbp(386_500), flexibleRemaining: gbp(211_000), todayRemaining: gbp(0), todaySpent: gbp(3500),
    });
    expect(checkInvariants(s1, T)).toEqual([]);
  });
  it('S1: explanation numbers equal the diff and protected items are named unchanged', () => {
    const e = r1.explanationFacts.sentence;
    expect(e).toBe(
      "Added your £35 expense (household, 10 Nov). That day's allowance covered £25.84; the other £9.16 comes from later days. " +
      'Shopping decreased by £9.16 across 11 Nov – 31 Jan. Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.',
    );
    assertNumbersFromDiff(e, r1.diff);
    expect(r1.diff.protectedUnchanged).toBe(true);
  });
  stack = commit(stack, s0, s1).stack;

  // S2
  it('S2: "£20 dinner tomorrow" preview fits and does not mutate state', () => {
    const frozen = structuredClone(s1);
    const p = previewIntent(s1, S2, T);
    expect(s1).toEqual(frozen);
    expect(p.ok).toBe(true);
    expect(p.affordability).toMatchObject({ fits: true, dayRemaining: 2573, remainingAfter: 573 });
    const a = affordability(s1, S2, T) as Affordability;
    expect(a.fits).toBe(true);
  });
  const r2 = ok(applyIntent(s1, S2, T));
  const s2 = r2.nextState;
  it('S2 Apply: eating out → £20, shopping → £0, groceries → £0.53, transport unchanged, day total unchanged', () => {
    expect(cells(s2, '2026-11-11')).toEqual({ groceries: 53, transport: 520, 'eating-out': 2000, shopping: 0 });
    expect(total(s2, '2026-11-11')).toBe(2573);
    expect(s2.plan!.summary.flexibleRemaining).toEqual(gbp(211_000));
    expect(r2.diff.changedDays).toEqual(['2026-11-11']);
    assertNumbersFromDiff(r2.explanationFacts.sentence, r2.diff);
  });
  stack = commit(stack, s1, s2).stack;

  // S3
  const aff = affordability(s2, S3(), T) as Affordability;
  it('S3: £60 concert on Saturday 14 Nov does not fit: shortfall £34.27 with 3 options', () => {
    expect(aff.fits).toBe(false);
    if (aff.fits) return;
    expect(aff.dayRemaining).toBe(2573);
    expect(aff.shortfall).toBe(3427);
    expect(aff.options.map((o) => o.id)).toEqual(['shopping-later', 'eating-out-two-weeks', 'all-flexible-rest']);
    expect(aff.options.map((o) => o.title)).toEqual([
      'Shopping, 15 Nov – 30 Nov', 'Eating out, 15 Nov – 28 Nov', 'All flexible spending, 15 Nov – 31 Jan',
    ]);
    for (const o of aff.options) {
      expect(o.sources.reduce((a, x) => a + x.amount, 0)).toBe(3427);
      expect(checkInvariants(o.preview.nextState, T)).toEqual([]);
      expect(cells(o.preview.nextState, '2026-11-14')).toEqual({ groceries: 0, transport: 0, 'eating-out': 0, shopping: 0, concert: 6000 });
      assertNumbersFromDiff(o.preview.explanation.sentence, o.preview.diff);
    }
    // Eating out option: −£2.44 on 15–17 Nov, −£2.45 on 18–28 Nov (3×244 + 11×245 = 3,427).
    const eo = aff.options[1].preview.nextState;
    expect(cells(eo, '2026-11-15')['eating-out']).toBe(550 - 244);
    expect(cells(eo, '2026-11-28')['eating-out']).toBe(550 - 245);
    // Shopping option: −£2.14 ×13, −£2.15 on 28–30 Nov.
    const sh = aff.options[0].preview.nextState;
    expect(cells(sh, '2026-11-15').shopping).toBe(603 - 214);
    expect(cells(sh, '2026-11-30').shopping).toBe(603 - 215);
    // All flexible: −£0.43 ×5, −£0.44 ×73 per day.
    const al = aff.options[2].preview.nextState;
    expect(total(al, '2026-11-15')).toBe(2573 - 43);
    expect(total(al, '2027-01-31')).toBe(2573 - 44);
    expect(s2).toEqual(demoState2());
  });
  it('S3: applying without picking an option is refused and leaves state untouched', () => {
    const r = applyIntent(s2, S3(), T);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error?.code).toBe('shortfall');
    expect(r.ok === false && r.error?.details).toMatchObject({ shortfall: 3427 });
  });
  const r3 = ok(applyIntent(s2, S3('shopping-later'), T));
  const s3 = r3.nextState;
  it('S3 Apply (shopping option): concert £60 planned on Sat, flexible left stays £2,110', () => {
    expect(s3.plan!.summary.flexibleRemaining).toEqual(gbp(211_000));
    expect(s3.plan!.summary.earmarked).toEqual(gbp(8000));
    expect(r3.explanationFacts.sentence).toContain('Shopping decreased by £34.27 across 15 Nov – 30 Nov.');
    expect(r3.diff.protectedUnchanged).toBe(true);
    expect(checkInvariants(s3, T)).toEqual([]);
  });
  stack = commit(stack, s2, s3).stack;

  // S4
  const r4 = ok(applyIntent(s3, S4, T));
  const s4 = r4.nextState;
  it('S4: +£200 income spread over 11 Nov – 31 Jan (+£2.43 ×8, +£2.44 ×74)', () => {
    expect(s4.plan!.summary.balance).toEqual(gbp(406_500));
    expect(s4.plan!.summary.flexibleRemaining).toEqual(gbp(231_000));
    expect(total(s4, '2026-11-12') - total(s3, '2026-11-12')).toBe(243);
    expect(total(s4, '2026-11-18') - total(s3, '2026-11-18')).toBe(243);
    expect(total(s4, '2026-11-19') - total(s3, '2026-11-19')).toBe(244);
    expect(total(s4, T)).toBe(total(s3, T));
    expect(r4.diff.additions.reduce((a, m) => a + m.amount.pence, 0)).toBe(20000);
    assertNumbersFromDiff(r4.explanationFacts.sentence, r4.diff);
    expect(checkInvariants(s4, T)).toEqual([]);
  });
  stack = commit(stack, s3, s4).stack;

  it('Undo restores the state after S3 exactly, then S2, S1, S0', () => {
    let u = undo(stack)!;
    expect(u.state).toEqual(s3);
    u = undo(u.stack)!;
    expect(u.state).toEqual(s2);
    u = undo(u.stack)!;
    expect(u.state).toEqual(s1);
    u = undo(u.stack)!;
    expect(u.state).toEqual(s0);
    expect(undo(u.stack)).toBeNull();
  });

  it('Deficit: £2,400 tuition deposit after S1 → short £140 of the reserve, savings unfunded', () => {
    const r = ok(applyIntent(s1, { kind: 'expense', amount: gbp(240_000), date: T, category: 'tuition', idempotencyKey: 'tuition' }, T));
    const p = r.nextState.plan!;
    expect(p.summary.balance).toEqual(gbp(146_500));
    expect(p.summary.flexibleRemaining).toEqual(gbp(0));
    expect(p.summary.plannedSavings).toEqual(gbp(0));
    expect(p.fundingGap).toEqual(gbp(29_000));
    expect(p.deficits).toEqual([
      expect.objectContaining({ kind: 'savings-unfunded', amount: gbp(15_000) }),
      expect.objectContaining({ kind: 'reserve-short', date: '2027-01-01', amount: gbp(8500) }),
      expect.objectContaining({ kind: 'reserve-short', date: '2027-01-15', amount: gbp(5500) }),
    ]);
    expect(r.nextState.profile.minimumReserve).toEqual(gbp(50_000));
    expect(r.diff.protectedUnchanged).toBe(true);
    expect(p.allocations.every((a) => a.planned.pence >= 0)).toBe(true);
    assertNumbersFromDiff(r.explanationFacts.sentence, r.diff);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });

  it('Rent +£50 next month: £670 from 1 Dec, +£100 over the plan, taken from shopping', () => {
    const r = ok(applyIntent(s1, { kind: 'commitmentChange', change: { op: 'adjust', target: 'rent', delta: gbp(5000), effectiveFrom: '2026-12-01' }, idempotencyKey: 'rent' }, T));
    expect(r.diff.commitment).toMatchObject({ before: gbp(62_000), after: gbp(67_000), totalDelta: gbp(10_000) });
    expect(r.diff.sources).toEqual([expect.objectContaining({ category: 'shopping', amount: gbp(10_000) })]);
    expect(cells(r.nextState, '2026-11-11').shopping).toBe(603 - 121);
    expect(cells(r.nextState, '2027-01-31').shopping).toBe(602 - 122);
    expect(r.diff.protectedUnchanged).toBe(false);
    assertNumbersFromDiff(r.explanationFacts.sentence, r.diff);
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });

  it('Keep £30 for Saturday: +£4.27 from shopping 15–30 Nov', () => {
    const r = ok(applyIntent(s1, { kind: 'preference', date: '2026-11-14', amount: gbp(3000), idempotencyKey: 'pref' }, T));
    expect(total(r.nextState, '2026-11-14')).toBe(3000);
    expect(r.diff.sources).toEqual([expect.objectContaining({ category: 'shopping', amount: gbp(427) })]);
    expect(cells(r.nextState, '2026-11-15').shopping).toBe(603 - 26);
    expect(cells(r.nextState, '2026-11-30').shopping).toBe(603 - 27);
    // A later overspend cannot take Saturday below £30.
    const r2 = ok(applyIntent(r.nextState, { kind: 'expense', amount: gbp(200_000), date: T, category: 'household', idempotencyKey: 'big' }, T));
    expect(total(r2.nextState, '2026-11-14')).toBeGreaterThanOrEqual(3000);
    expect(checkInvariants(r2.nextState, T)).toEqual([]);
  });

  it('Save another £100: goal £150 → £250, shopping −£100', () => {
    const r = ok(applyIntent(s1, { kind: 'goal', amount: gbp(10_000), byDate: '2026-11-30', idempotencyKey: 'goal' }, T));
    expect(r.nextState.profile.savingsGoal).toEqual(gbp(25_000));
    expect(r.diff.sources).toEqual([expect.objectContaining({ category: 'shopping', amount: gbp(10_000) })]);
    expect(r.explanationFacts.sentence).toContain('Your savings goal rose by £100 to £250.');
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
});

function demoState2(): EngineState {
  const { state } = demoFixture();
  const a = ok(applyIntent(state, S1, T)).nextState;
  return ok(applyIntent(a, S2, T)).nextState;
}
