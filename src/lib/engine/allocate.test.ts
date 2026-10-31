import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocateDayTotals, splitDay } from './allocate';

describe('allocateDayTotals', () => {
  it('spreads evenly with remainder pence on the latest days', () => {
    const t = allocateDayTotals(10, [10, 10, 10, 10], [0, 0, 0, 0]);
    expect(t).toEqual([2, 2, 3, 3]);
  });
  it('lowers the window before a cash cap instead of borrowing from later money', () => {
    // 3 days capped at 300 in total before an income; 10 days overall, budget 2000.
    const caps = [300, 300, 300, 2000, 2000, 2000, 2000, 2000, 2000, 2000].map((c, i, a) => Math.min(...a.slice(i)));
    const t = allocateDayTotals(2000, caps, Array(10).fill(0));
    expect(t.slice(0, 3)).toEqual([100, 100, 100]);
    expect(t.slice(3).every((x) => x === 242 || x === 243)).toBe(true);
    expect(t.reduce((a, b) => a + b, 0)).toBe(2000);
  });
  it('honours lower bounds and re-levels the rest', () => {
    const t = allocateDayTotals(1000, Array(4).fill(1000), [700, 0, 0, 0]);
    expect(t).toEqual([700, 100, 100, 100]);
  });
  it('property: sum = P, prefix <= caps, >= lower bounds, even when unconstrained', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 1, maxLength: 60 }),
      fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 60, maxLength: 60 }),
      fc.integer({ min: 0, max: 200000 }),
      (inc, lbAll, extra) => {
        const n = inc.length;
        const lb = lbAll.slice(0, n);
        let acc = 0;
        const raw = inc.map((x) => (acc += x));
        let pre = 0;
        const preL = lb.map((x) => (pre += x));
        const P = Math.max(raw[n - 1], preL[n - 1]) + extra;
        const capsRaw = raw.map((r, i) => Math.max(r, preL[i]));
        capsRaw[n - 1] = P;
        const caps = capsRaw.map((_, i) => Math.min(...capsRaw.slice(i)));
        const t = allocateDayTotals(P, caps, lb);
        expect(t.reduce((a, b) => a + b, 0)).toBe(P);
        let s = 0;
        t.forEach((x, i) => {
          s += x;
          expect(x).toBeGreaterThanOrEqual(lb[i]);
          expect(s).toBeLessThanOrEqual(caps[i]);
        });
      }));
  });
});

describe('splitDay', () => {
  const cats = [
    { weight: 900, hard: 0, floor: 0 }, { weight: 520, hard: 0, floor: 0 },
    { weight: 550, hard: 0, floor: 0 }, { weight: 614, hard: 0, floor: 0 },
  ];
  it('splits the demo day by weight exactly', () => {
    expect(splitDay(2584, cats).amounts).toEqual([900, 520, 550, 614]);
  });
  it('keeps hard bounds and fills essentials floors first', () => {
    const r = splitDay(1000, [{ weight: 1, hard: 0, floor: 600 }, { weight: 1, hard: 300, floor: 0 }]);
    expect(r.amounts).toEqual([600, 400]);
    const short = splitDay(500, [{ weight: 1, hard: 0, floor: 600 }, { weight: 1, hard: 0, floor: 0 }]);
    expect(short).toEqual({ amounts: [500, 0], essentialShort: 100 });
  });
});
