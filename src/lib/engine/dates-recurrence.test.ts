import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, dateRange, dayOfWeek, daysInMonth, isISODate } from './dates';
import { formatMoney, gbp, largestRemainder, evenSplitLatest } from './money';
import { occurrences } from './recurrence';
import type { Commitment } from './types';

const monthly = (day: number, pence = 1000): Commitment => ({
  id: 'x', name: 'X', amount: gbp(pence), locked: true, recurrence: { kind: 'monthly', dayOfMonth: day },
});

describe('dates', () => {
  it('validates ISO calendar days', () => {
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2027-02-29')).toBe(false);
    expect(isISODate('2026-11-31')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
  });
  it('counts the 83-day demo horizon and weekdays', () => {
    expect(dateRange('2026-11-10', '2027-01-31')).toHaveLength(83);
    expect(dayOfWeek('2026-11-10')).toBe(2); // Tuesday
    expect(dayOfWeek('2026-11-14')).toBe(6); // Saturday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('I9 recurrence across month lengths', () => {
  it('clamps day 31 to the last day of short months', () => {
    expect(occurrences(monthly(31), '2026-11-01', '2027-04-30').map((o) => o.date)).toEqual([
      '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30',
    ]);
  });
  it('clamps day 29/30 in February, including leap years', () => {
    expect(occurrences(monthly(30), '2028-01-01', '2028-03-31').map((o) => o.date)).toEqual(['2028-01-30', '2028-02-29', '2028-03-30']);
    expect(occurrences(monthly(29), '2027-02-01', '2027-02-28').map((o) => o.date)).toEqual(['2027-02-28']);
  });
  it('lands rent on the 1st and utilities on the 15th in the demo window', () => {
    expect(occurrences(monthly(1), '2026-11-10', '2027-01-31').map((o) => o.date)).toEqual(['2026-12-01', '2027-01-01']);
    expect(occurrences(monthly(15), '2026-11-10', '2027-01-31').map((o) => o.date)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });
  it('honours dated amount changes and once-off dates', () => {
    const c: Commitment = { ...monthly(1, 62000), amountChanges: [{ from: '2026-12-01', amount: gbp(67000) }] };
    expect(occurrences(c, '2026-11-01', '2027-01-31').map((o) => o.pence)).toEqual([62000, 67000, 67000]);
    const once: Commitment = { ...monthly(1), recurrence: { kind: 'once', date: '2026-12-05' } };
    expect(occurrences(once, '2026-12-05', '2026-12-05')).toHaveLength(1);
    expect(occurrences(once, '2026-12-06', '2026-12-31')).toHaveLength(0);
  });
  it('property: exactly one occurrence per calendar month, never past month end', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 31 }), fc.integer({ min: 2020, max: 2035 }), (day, y) => {
      const occ = occurrences(monthly(day), `${y}-01-01`, `${y}-12-31`);
      expect(occ).toHaveLength(12);
      occ.forEach((o, i) => {
        expect(o.date.slice(5, 7)).toBe(String(i + 1).padStart(2, '0'));
        expect(+o.date.slice(8)).toBe(Math.min(day, daysInMonth(y, i + 1)));
      });
    }));
  });
});

describe('money', () => {
  it('formats £x.xx and drops .00', () => {
    expect(formatMoney(gbp(2584))).toBe('£25.84');
    expect(formatMoney(gbp(3500))).toBe('£35');
    expect(formatMoney(gbp(390000))).toBe('£3,900');
    expect(formatMoney(gbp(5))).toBe('£0.05');
    expect(formatMoney(-916)).toBe('-£9.16');
  });
  it('rejects non-integer pence', () => {
    expect(() => gbp(1.5)).toThrow();
  });
  it('I8 largest remainder: exact sum, deterministic, ties to the earliest index', () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(largestRemainder(2585, [900, 520, 550, 614])).toEqual([901, 520, 550, 614]);
    expect(evenSplitLatest(214500, 83).slice(-29)).toEqual([2584, ...Array(28).fill(2585)]);
    fc.assert(fc.property(fc.integer({ min: 0, max: 1e7 }), fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 8 }).filter((w) => w.some((x) => x > 0)), (t, w) => {
      const r = largestRemainder(t, w);
      expect(r.reduce((a, b) => a + b, 0)).toBe(t);
      expect(largestRemainder(t, w)).toEqual(r);
      const W = w.reduce((a, b) => a + b, 0);
      r.forEach((x, i) => expect(Math.abs(x - (t * w[i]) / W)).toBeLessThan(1));
    }));
  });
});
