import { describe, expect, it } from 'vitest';
import { CATALOGUE, CuratedOfferSource, matchOffers, potentialSaving } from './index';

const plan = [
  { category: 'eating-out', plannedPence: 5_000 },
  { category: 'groceries', plannedPence: 20_000 },
  { category: 'transport', plannedPence: 10_000 },
];

describe('catalogue', () => {
  it('has 10-14 offers, all sample with source, checked date, confidence', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(10);
    expect(CATALOGUE.length).toBeLessThanOrEqual(14);
    for (const o of CATALOGUE) {
      expect(o.sample).toBe(true);
      expect(o.source).toMatch(/^https?:\/\//);
      expect(o.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['low', 'medium']).toContain(o.confidence);
    }
    expect(new Set(CATALOGUE.map((o) => o.id)).size).toBe(CATALOGUE.length);
  });
});

describe('matchOffers', () => {
  it('only returns offers for categories with planned spend', () => {
    const r = matchOffers([{ category: 'eating-out', plannedPence: 3_000 }], { area: 'UK' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.offer.category === 'eating-out')).toBe(true);
    expect(matchOffers([{ category: 'groceries', plannedPence: 0 }], {})).toEqual([]);
  });
  it('hides London offers outside London and shows them in London', () => {
    const away = matchOffers(plan, { area: 'Leeds' }).map((x) => x.offer.id);
    const lon = matchOffers(plan, { area: 'London' }).map((x) => x.offer.id);
    expect(away).not.toContain('student-oyster-18plus');
    expect(lon).toContain('student-oyster-18plus');
  });
  it('ranks held memberships higher and flags eligibility', () => {
    const without = matchOffers(plan, { area: 'UK' });
    const withCard = matchOffers(plan, { area: 'UK', memberships: ['tesco-clubcard'] });
    const idx = (l: typeof without) => l.findIndex((x) => x.offer.id === 'tesco-clubcard');
    expect(idx(withCard)).toBeLessThan(idx(without));
    expect(withCard[idx(withCard)]?.eligibleNow).toBe(true);
    expect(without[idx(without)]?.eligibleNow).toBe(false);
  });
  it('is deterministic regardless of input order', () => {
    const a = matchOffers(plan, { area: 'London' }).map((x) => x.offer.id);
    const b = matchOffers([...plan].reverse(), { area: 'London' }, [...CATALOGUE].reverse()).map((x) => x.offer.id);
    expect(b).toEqual(a);
  });
  it('orders by score descending', () => {
    const s = matchOffers(plan, { area: 'London', memberships: ['railcard-16-25'] }).map((x) => x.score);
    expect([...s].sort((x, y) => y - x)).toEqual(s);
  });
});

describe('potentialSaving', () => {
  it('is always typed potential, never realised', () => {
    for (const o of CATALOGUE) {
      const s = potentialSaving(o, 10_000);
      expect(s.kind).toBe('potential');
      expect(Number.isInteger(s.pence)).toBe(true);
      expect(s.pence).toBeGreaterThanOrEqual(0);
      expect(s.pence).toBeLessThanOrEqual(10_000);
    }
  });
  it('computes percent and flat amounts, and 0 when no figure is stated', () => {
    const zizzi = CATALOGUE.find((o) => o.id === 'zizzi-student')!;
    expect(potentialSaving(zizzi, 5_000).pence).toBe(1_500);
    expect(potentialSaving({ ...zizzi, percentOff: undefined, amountOffPence: 500 }, 300).pence).toBe(300);
    expect(potentialSaving(CATALOGUE.find((o) => o.id === 'lidl-plus')!, 5_000).pence).toBe(0);
  });
});

describe('CuratedOfferSource', () => {
  it('lists catalogue offers filtered by area', async () => {
    const src = new CuratedOfferSource();
    const uk = await src.list({ area: 'Leeds' });
    const lon = await src.list({ area: 'London' });
    expect(uk.some((o) => o.area === 'London')).toBe(false);
    expect(lon.length).toBeGreaterThan(uk.length);
    expect(uk.every((o) => o.sample === true)).toBe(true);
  });
});
