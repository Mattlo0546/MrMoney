import { describe, expect, it } from 'vitest';
import { dateRange, dayOfWeek } from '@/lib/engine';
import { resolveCategories, scheduleItinerary } from './schedule';
import { TEST_CATALOG } from './testCatalog';
import type { ScheduleInput, ScheduleResult } from './types';
import { DEFAULT_PREFS, EMPTY_ANSWERS } from './types';

const CATS = { groceries: 'groceries', transport: 'transport', eatingOut: 'eating-out', shopping: 'shopping' };

function input(over: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    catalog: TEST_CATALOG,
    prefs: { ...DEFAULT_PREFS, lines: ['Circle line', 'District line'], cuisines: ['Chinese', 'Italian', 'British'], treatsPerWeek: 1 },
    answers: EMPTY_ANSWERS,
    start: '2026-11-02',
    end: '2026-11-30',
    budgetPence: 40_000,
    incomeDates: ['2026-11-20'],
    categories: CATS,
    ...over,
  };
}

const groceries = (r: ScheduleResult) => r.purchases.filter((p) => p.id.endsWith('-groceries'));

function checkInvariants(inp: ScheduleInput, r: ScheduleResult) {
  for (const p of r.purchases) {
    expect(p.lines && p.lines.length).toBeTruthy();
    expect(p.lines!.reduce((s, l) => s + l.pence, 0)).toBe(p.amount.pence);
    expect(Number.isInteger(p.amount.pence)).toBe(true);
    if (p.id.endsWith('-groceries')) expect(p.amount.pence).toBeGreaterThanOrEqual(0);
    else expect(p.amount.pence).toBeGreaterThan(0);
    if (p.amount.pence === 0) {
      expect(p.lines!.every((l) => l.pence === 0)).toBe(true);
      expect(p.reason).toMatch(/uses leftovers — £0 day/);
    }
    expect(p.id.startsWith('itin-')).toBe(true);
    expect(p.source).toBe('itinerary');
    expect(p.ref?.sourceUrl).toMatch(/^https:\/\//);
    expect(p.date >= inp.start && p.date <= inp.end).toBe(true);
    for (const l of p.lines!) {
      expect(l.ref.sourceUrl).toMatch(/^https:\/\//);
      expect(l.pence).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(l.pence)).toBe(true);
    }
  }
  const total = r.purchases.reduce((s, p) => s + p.amount.pence, 0);
  expect(r.totalPence).toBe(total);
  expect(total).toBeLessThanOrEqual(Math.max(0, inp.budgetPence));
  expect(r.leftoverPence).toBe(Math.max(0, inp.budgetPence) - total);
  expect(r.byBucket.groceries + r.byBucket.transport + r.byBucket.eatingOut + r.byBucket.shopping).toBe(total);
  for (const c of inp.caps ?? []) {
    const cum = r.purchases.filter((p) => p.date <= c.date).reduce((s, p) => s + p.amount.pence, 0);
    expect(cum).toBeLessThanOrEqual(c.cap);
  }
  expect(new Set(r.purchases.map((p) => p.id)).size).toBe(r.purchases.length);
}

describe('scheduleItinerary', () => {
  it('is deterministic', () => {
    expect(scheduleItinerary(input())).toEqual(scheduleItinerary(input()));
    expect(scheduleItinerary(input({ seed: 7 }))).toEqual(scheduleItinerary(input({ seed: 7 })));
  });

  it('itemises every purchase with real sources and fits the budget', () => {
    const inp = input();
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
    expect(groceries(r).length).toBeGreaterThan(15);
    expect(r.byBucket.transport).toBeGreaterThan(0);
  });

  it('every day in range has a groceries purchase (including £0 leftover days)', () => {
    for (const budget of [40_000, 200_000]) {
      const inp = input({ budgetPence: budget });
      const r = scheduleItinerary(inp);
      checkInvariants(inp, r);
      const gDays = new Set(groceries(r).map((p) => p.date));
      for (const d of dateRange(inp.start, inp.end)) expect(gDays.has(d)).toBe(true);
      for (const p of groceries(r)) expect(p.label).toMatch(/^Dinner: /);
    }
  });

  it('allocates unevenly: treat days cost more than the median day', () => {
    const r = scheduleItinerary(input());
    const g = groceries(r);
    const amounts = g.map((p) => p.amount.pence);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);
    expect(sd).toBeGreaterThan(0);
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const treats = g.filter((p) => /treat/.test(p.reason ?? ''));
    expect(treats.length).toBeGreaterThan(0);
    expect(treats.some((p) => p.amount.pence > median)).toBe(true);
    // Leftovers appear as £0 lines with a trace.
    expect(g.some((p) => p.lines!.some((l) => l.pence === 0 && /left over from/.test(l.note ?? '')))).toBe(true);
  });

  it('never schedules a disliked recipe and asks about liking scheduled ones', () => {
    const r = scheduleItinerary(input({ answers: { ...EMPTY_ANSWERS, disliked: ['egg-fried-rice', 'pesto-pasta'] } }));
    for (const p of groceries(r)) {
      expect(p.label).not.toMatch(/Egg fried rice|Pesto spaghetti/);
    }
    expect(r.questions.some((q) => q.kind === 'likeRecipe')).toBe(true);
    expect(r.questions.some((q) => q.target === 'egg-fried-rice')).toBe(false);
  });

  it('owned products cost £0 and the total drops', () => {
    const inp = input({ budgetPence: 200_000 });
    const before = scheduleItinerary(inp);
    const usesOyster = before.purchases.some((p) => p.lines!.some((l) => l.ref.id === 'oyster-sauce' && l.pence > 0));
    expect(usesOyster).toBe(true);
    const after = scheduleItinerary({ ...inp, answers: { ...EMPTY_ANSWERS, owned: { 'oyster-sauce': true, wok: true } } });
    checkInvariants(inp, after);
    const oysterLines = after.purchases.flatMap((p) => p.lines!).filter((l) => l.ref.id === 'oyster-sauce' || l.ref.id === 'wok');
    expect(oysterLines.length).toBeGreaterThan(0);
    for (const l of oysterLines) {
      expect(l.pence).toBe(0);
      expect(l.note).toBe('already in your cupboard');
    }
    expect(after.totalPence).toBeLessThan(before.totalPence);
    expect(after.questions.some((q) => q.target === 'oyster-sauce')).toBe(false);
  });

  it('asks whether the student already has oyster sauce, with the saving', () => {
    const r = scheduleItinerary(input({ budgetPence: 200_000 }));
    const q = r.questions.find((x) => x.kind === 'owned' && x.target === 'oyster-sauce');
    expect(q).toBeDefined();
    expect(q!.text).toMatch(/Do you already have .*Oyster Sauce/);
    expect(q!.savingPence).toBeGreaterThan(0);
    expect(r.questions.length).toBeLessThanOrEqual(12);
    expect(r.questions.some((x) => x.kind === 'keepWant')).toBe(true);
    for (let i = 1; i < r.questions.length; i++) {
      expect(r.questions[i - 1].savingPence ?? 0).toBeGreaterThanOrEqual(r.questions[i].savingPence ?? 0);
    }
  });

  it('places wants sensibly: eating out on a weekend, shopping from payday', () => {
    const r = scheduleItinerary(input({ budgetPence: 200_000 }));
    const ramen = r.purchases.find((p) => p.id.endsWith('-want-want-ramen'));
    const trainers = r.purchases.find((p) => p.id.endsWith('-want-want-trainers'));
    expect(ramen?.category).toBe('eating-out');
    expect([5, 6]).toContain(dayOfWeek(ramen!.date));
    expect(trainers?.category).toBe('shopping');
    expect(trainers!.date >= '2026-11-20').toBe(true);
  });

  it('transport only on commute days, within the daily cap', () => {
    const inp = input({ prefs: { ...input().prefs, lines: ['Metropolitan line'], commuteDays: [1, 3, 5] } });
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
    const t = r.purchases.filter((p) => p.id.endsWith('-transport') && !/Weekend/.test(p.label));
    expect(t.length).toBeGreaterThan(0);
    for (const p of t) {
      expect([1, 3, 5]).toContain(dayOfWeek(p.date));
      expect(p.amount.pence).toBeLessThanOrEqual(500);
      expect(p.lines!.every((l) => l.name.startsWith('Metropolitan line'))).toBe(true);
    }
    expect(t.some((p) => p.lines!.some((l) => l.note === 'daily cap reached'))).toBe(true);
    // Any other transport is a weekend off-peak trip.
    for (const p of r.purchases.filter((x) => x.id.endsWith('-transport') && /Weekend/.test(x.label))) {
      expect(dayOfWeek(p.date)).toBe(6);
    }
  });

  it('downgrades with notes on a tight budget, never negative', () => {
    const generous = scheduleItinerary(input({ budgetPence: 200_000 }));
    const inp = input({ budgetPence: 12_000 });
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
    expect(r.notes.some((n) => /Swapped|budget recipes|Dropped/.test(n))).toBe(true);
    expect(r.totalPence).toBeLessThan(generous.totalPence);
    expect(r.leftoverPence).toBeGreaterThanOrEqual(0);
  });

  it('tiny budget still fits (leaves days unplanned) with a note', () => {
    const inp = input({ budgetPence: 3_000 });
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
    expect(r.notes.some((n) => /Couldn't fit/.test(n))).toBe(true);
    const zero = scheduleItinerary(input({ budgetPence: 0 }));
    expect(zero.purchases).toHaveLength(0);
    expect(zero.leftoverPence).toBe(0);
  });

  it('respects cash caps', () => {
    const inp = input({ budgetPence: 30_000, caps: [{ date: '2026-11-19', cap: 9_000 }] });
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
  });

  it('keeps everything inside start..end', () => {
    const inp = input({ start: '2026-11-05', end: '2026-11-11' });
    const r = scheduleItinerary(inp);
    checkInvariants(inp, r);
    const days = new Set(dateRange(inp.start, inp.end));
    expect(r.purchases.every((p) => days.has(p.date))).toBe(true);
  });
});

describe('resolveCategories', () => {
  it('maps by id/name and falls back to canonical ids', () => {
    expect(
      resolveCategories([
        { id: 'food', name: 'Food' },
        { id: 'c2', name: 'Travel' },
        { id: 'c3', name: 'Takeaway' },
        { id: 'c4', name: 'Fun money' },
      ]),
    ).toEqual({ groceries: 'food', transport: 'c2', eatingOut: 'c3', shopping: 'c4' });
    expect(resolveCategories([])).toEqual(CATS);
    expect(resolveCategories([{ id: 'eating-out', name: 'Eating out' }]).eatingOut).toBe('eating-out');
  });
});
