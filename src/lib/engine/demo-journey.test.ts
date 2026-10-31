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
import { assertExplanationFromDiff } from './testkit';
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
    assertExplanationFromDiff(r1.explanationFacts, r1.diff);
    expect(r1.diff).toMatchObject({ takenFromLater: gbp(916), uncovered: gbp(0) });
    expect(r1.diff.protectedUnchanged).toBe(true);
  });
  stack = commit(stack, s0, s1).stack;

  // S2 (D16): the dinner fits by borrowing from later days' shopping.
  it('S2: "£20 dinner tomorrow" fits by borrowing £8.47 from shopping over 12–18 Nov; preview does not mutate state', () => {
    const frozen = structuredClone(s1);
    const p = previewIntent(s1, S2, T);
    expect(s1).toEqual(frozen);
    expect(p.ok).toBe(true);
    // 11 Nov can give eating out £5.50 + shopping £6.03 = £11.53 without touching essentials.
    expect(p.affordability).toMatchObject({
      fits: true, dayRemaining: 1153, dayAvailable: 1153, dayRemainingTotal: 2573, borrowed: 847, remainingAfter: 1420,
      message: 'Fits — £8.47 comes from shopping over 12–18 Nov',
    });
    const a = affordability(s1, S2, T) as Affordability;
    expect(a.fits && a.borrowing).toEqual({
      amount: gbp(847), from: '2026-11-12', to: '2026-11-18',
      sources: [expect.objectContaining({ category: 'shopping', amount: gbp(847), from: '2026-11-12', to: '2026-11-18' })],
    });
  });
  const r2 = ok(applyIntent(s1, S2, T));
  const s2 = r2.nextState;
  it('S2 Apply: eating out → £20, shopping → £0, groceries and transport unchanged; −£1.21 shopping on 12–18 Nov', () => {
    expect(cells(s2, '2026-11-11')).toEqual({ groceries: 900, transport: 520, 'eating-out': 2000, shopping: 0 });
    expect(cells(s1, '2026-11-11')).toMatchObject({ groceries: 900, transport: 520 });
    for (const d of ['2026-11-12', '2026-11-15', '2026-11-18']) expect(cells(s2, d)).toEqual({ groceries: 900, transport: 520, 'eating-out': 550, shopping: 482 });
    expect(cells(s2, '2026-11-19').shopping).toBe(603);
    expect(r2.diff.borrowed!.amount).toEqual(gbp(847));
    expect(r2.diff.sameDaySources).toEqual([expect.objectContaining({ category: 'shopping', amount: gbp(603) })]);
    expect(s2.plan!.summary.flexibleRemaining).toEqual(gbp(211_000));
    expect(r2.diff.changedDays).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(r2.explanationFacts.sentence).toBe(
      'Fits — £8.47 comes from shopping over 12–18 Nov. Set aside £20 for Dinner (eating out) on 11 Nov. ' +
      'To make room, shopping went down by £6.03 on 11 Nov. Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.',
    );
    assertExplanationFromDiff(r2.explanationFacts, r2.diff);
    expect(checkInvariants(s2, T)).toEqual([]);
  });
  stack = commit(stack, s1, s2).stack;

  // S3: the concert exceeds what the week can lend (cap: next 7 days, half of each
  // non-essential cell), so it still shows a shortfall with options.
  const aff = affordability(s2, S3(), T) as Affordability;
  it('S3: £60 concert on Sat 14 Nov: £10.32 to spare + £37.92 borrowable → £11.76 short, 4 options', () => {
    expect(aff.fits).toBe(false);
    if (aff.fits) return;
    expect(aff.dayRemaining).toBe(1032);
    expect(aff.dayAvailable).toBe(1032);
    expect(aff.borrowable).toBe(3792);
    expect(aff.shortfall).toBe(1176);
    expect(aff.amount - aff.dayRemaining - aff.borrowable!).toBe(aff.shortfall);
    expect(aff.borrowing!.sources.map((x) => [x.category, x.amount.pence])).toEqual([['shopping', 1867], ['eating-out', 1925]]);
    expect(aff.message).toBe(
      '£11.76 short — 14 Nov has £10.32 to spare and £37.92 can be borrowed from shopping (£18.67) and eating out (£19.25) over 15–21 Nov without touching groceries, transport or protected money',
    );
    expect(aff.options.map((o) => o.id)).toEqual(['shopping-later', 'eating-out-two-weeks', 'all-flexible-rest', 'earlier-days']);
    expect(aff.options.map((o) => o.title)).toEqual([
      'Shopping, 15 Nov – 30 Nov', 'Eating out, 15 Nov – 28 Nov', 'All flexible spending, 15 Nov – 31 Jan', 'Shopping and eating out, 11 Nov – 13 Nov',
    ]);
    for (const o of aff.options) {
      expect(o.sources.reduce((a, x) => a + x.amount, 0)).toBe(1176);
      expect(o.borrowed).toBe(3792);
      expect(checkInvariants(o.preview.nextState, T)).toEqual([]);
      expect(cells(o.preview.nextState, '2026-11-14')).toEqual({ groceries: 900, transport: 520, 'eating-out': 0, shopping: 0, concert: 6000 });
      assertExplanationFromDiff(o.preview.explanation, o.preview.diff);
    }
    expect(s2).toEqual(demoState2());
  });
  it('S3: applying without picking an option is refused and leaves state untouched', () => {
    const r = applyIntent(s2, S3(), T);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error?.code).toBe('shortfall');
    expect(r.ok === false && r.error?.details).toMatchObject({ shortfall: 1176, dayRemaining: 1032, borrowable: 3792 });
  });
  const r3 = ok(applyIntent(s2, S3('shopping-later'), T));
  const s3 = r3.nextState;
  it('S3 Apply (shopping option): concert £60 planned on Sat, essentials untouched, flexible left stays £2,110', () => {
    expect(s3.plan!.summary.flexibleRemaining).toEqual(gbp(211_000));
    expect(s3.plan!.summary.earmarked).toEqual(gbp(8000));
    expect(r3.diff.borrowed!.amount).toEqual(gbp(3792));
    expect(r3.diff.tradeoff).toMatchObject({ optionId: 'shopping-later', amount: gbp(1176) });
    expect(r3.explanationFacts.sentence).toContain('That day had £10.32 to spare, £37.92 is borrowed from shopping (£18.67) and eating out (£19.25) over 15–21 Nov, and the other £11.76 comes from your chosen trade-off');
    expect(r3.diff.protectedUnchanged).toBe(true);
    assertExplanationFromDiff(r3.explanationFacts, r3.diff);
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
    assertExplanationFromDiff(r4.explanationFacts, r4.diff);
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

  it('Deficit: £2,400 tuition after S1: £2,110 from later days, £290 not covered; reserve £140 short, savings unfunded (said honestly)', () => {
    const r = ok(applyIntent(s1, { kind: 'expense', amount: gbp(240_000), date: T, category: 'tuition', idempotencyKey: 'tuition' }, T));
    const p = r.nextState.plan!;
    expect(p.summary.balance).toEqual(gbp(146_500));
    expect(p.summary.flexibleRemaining).toEqual(gbp(0));
    expect(p.summary.plannedSavings).toEqual(gbp(0));
    expect(p.fundingGap).toEqual(gbp(29_000));
    expect(r.diff).toMatchObject({ absorbed: gbp(0), overspend: gbp(240_000), takenFromLater: gbp(211_000), uncovered: gbp(29_000) });
    expect(p.deficits).toEqual([
      expect.objectContaining({ kind: 'savings-unfunded', amount: gbp(15_000) }),
      expect.objectContaining({ kind: 'reserve-short', date: '2027-01-01', amount: gbp(8500) }),
      expect.objectContaining({ kind: 'reserve-short', date: '2027-01-15', amount: gbp(5500) }),
      expect.objectContaining({ kind: 'essentials' }),
    ]);
    expect(r.nextState.profile.minimumReserve).toEqual(gbp(50_000));
    expect(r.diff.protectedAfter).toMatchObject({ plannedSavings: gbp(0), reserveShortfall: gbp(14_000) });
    expect(r.diff.protectedUnchanged).toBe(false);
    const e = r.explanationFacts.sentence;
    expect(e).toContain('£2,110 comes from later days; £290 couldn\'t be covered.');
    expect(e).toContain('Your £500 emergency reserve would run £140 short at its lowest point. Your £150 savings goal can no longer be funded.');
    expect(e).not.toMatch(/reserve and your £150 savings goal are unchanged/);
    expect(p.allocations.every((a) => a.planned.pence >= 0)).toBe(true);
    assertExplanationFromDiff(r.explanationFacts, r.diff);
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
    expect(r.explanationFacts.sentence).toContain('Your savings goal rose by £100 to £250, set aside by 30 Nov.');
    expect(r.nextState.profile.savingsDeadlines).toEqual([{ amount: gbp(10_000), byDate: '2026-11-30' }]);
    expect(r.diff.sources[0].days.at(-1)).toBe('2026-11-30');
    expect(checkInvariants(r.nextState, T)).toEqual([]);
  });
});

function demoState2(): EngineState {
  const { state } = demoFixture();
  const a = ok(applyIntent(state, S1, T)).nextState;
  return ok(applyIntent(a, S2, T)).nextState;
}
