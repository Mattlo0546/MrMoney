import { beforeEach, describe, expect, it } from 'vitest';
import { annotateCitations, cacheKey, CACHE_TTL_MS, citeItems, clearResearchCache, runResearch } from './research';
import { geminiResponse, hangingFetch, scriptedFetch } from './testkit';

const GROUNDED_TEXT = '* Zopa Easy Access: 4.56% AER variable.\n* Chase Saver: 4.50% AER with bonus.';
const gm = {
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/1', title: 'moneysavingexpert.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/2', title: 'moneysupermarket.com' } },
  ],
  groundingSupports: [
    { segment: { startIndex: 0, endIndex: 39 }, groundingChunkIndices: [0] },
    { segment: { startIndex: 40, endIndex: 76 }, groundingChunkIndices: [1] },
  ],
};
const EXTRACTED = {
  items: [
    { provider: 'Zopa', product: 'Easy Access', headline: '4.56% AER variable', ratePercent: 4.56, conditions: ['New customers'], sourceIndex: 1 },
    { provider: 'Chase', product: 'Saver', headline: '4.50% AER', ratePercent: 4.5, conditions: [], sourceIndex: 2 },
    { provider: 'Ghost Bank', product: 'Made up', headline: '9% AER', ratePercent: 9, conditions: [], sourceIndex: null },
    { provider: 'Out of range', product: 'X', headline: '5%', ratePercent: 5, conditions: [], sourceIndex: 7 },
  ],
};

function liveFetch() {
  return scriptedFetch([
    (c) => {
      expect(c.body.tools).toEqual([{ google_search: {} }]);
      return geminiResponse([{ text: GROUNDED_TEXT }], { groundingMetadata: gm });
    },
    (c) => {
      expect(c.url).toContain('gemini-3.5-flash-lite');
      expect((c.body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');
      return geminiResponse([{ text: JSON.stringify(EXTRACTED) }]);
    },
  ]);
}

const args = { topic: 'savings_rates' as const, query: 'best easy-access savings rate' };
const T0 = new Date('2026-10-31T10:00:00Z');

beforeEach(() => clearResearchCache());

describe('citeItems', () => {
  it('drops items without a valid grounding chunk and keeps the chunk URL as the source', () => {
    const items = citeItems(EXTRACTED.items, gm, GROUNDED_TEXT);
    expect(items.map((i) => i.provider)).toEqual(['Zopa', 'Chase']);
    expect(items[0]).toMatchObject({ sourceUrl: gm.groundingChunks[0].web.uri, sourceTitle: 'moneysavingexpert.com', ratePercent: 4.56 });
  });
  it('drops a rate that does not appear in the grounded text', () => {
    const [it0] = citeItems([{ provider: 'Zopa', product: 'EA', headline: 'h', ratePercent: 6.1, conditions: [], sourceIndex: 1 }], gm, GROUNDED_TEXT);
    expect(it0.ratePercent).toBeUndefined();
  });
  it('rejects non-http chunk URIs', () => {
    const bad = { groundingChunks: [{ web: { uri: 'javascript:alert(1)', title: 'x' } }] };
    expect(citeItems([{ provider: 'p', product: 'q', headline: 'h', conditions: [], sourceIndex: 1 }], bad, '')).toEqual([]);
  });
});

describe('annotateCitations', () => {
  it('inserts [n] markers at UTF-8 byte offsets (handles £)', () => {
    const text = 'Pay £10 here. Next.';
    const end = Buffer.byteLength('Pay £10 here.', 'utf8');
    expect(annotateCitations(text, { groundingSupports: [{ segment: { endIndex: end }, groundingChunkIndices: [0, 2] }] })).toBe('Pay £10 here. [1][3] Next.');
  });
});

describe('runResearch', () => {
  it('grounded search + extraction -> cited items with refs and retrievedAt', async () => {
    const f = liveFetch();
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31', now: () => T0 });
    expect(r.sample).toBe(false);
    expect(r.retrievedAt).toBe(T0.toISOString());
    expect(r.label).toMatch(/Check with the provider/);
    expect(r.items).toHaveLength(2);
    expect(r.items.every((i) => i.sourceUrl.startsWith('https://') && /^r-[a-z0-9]+-\d$/.test(i.ref))).toBe(true);
    expect(f.calls[0].headers['x-goog-api-key']).toBe('k');
  });

  it('caches per (topic, city) for 6 hours', async () => {
    const f = liveFetch();
    const d = (now: Date) => ({ apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31', now: () => now });
    const first = await runResearch(args, d(T0));
    const again = await runResearch({ ...args, query: 'different wording' }, d(new Date(T0.getTime() + CACHE_TTL_MS - 1000)));
    expect(f.calls).toHaveLength(2);
    expect(again).toMatchObject({ cached: true, items: first.items });
    await runResearch({ ...args, city: 'London' }, d(T0));
    expect(f.calls).toHaveLength(4);
    await runResearch(args, d(new Date(T0.getTime() + CACHE_TTL_MS + 1)));
    expect(f.calls).toHaveLength(6);
  });

  it('keys "other" on the query too', () => {
    expect(cacheKey({ topic: 'other', query: 'A' })).not.toBe(cacheKey({ topic: 'other', query: 'B' }));
    expect(cacheKey({ topic: 'cheap_food', query: 'A', city: 'London ' })).toBe(cacheKey({ topic: 'cheap_food', query: 'B', city: 'london' }));
  });

  it('falls back to curated samples (sample: true) when search fails, and does not cache the fallback', async () => {
    const f = scriptedFetch([() => new Response('err', { status: 500 })]);
    const reasons: string[] = [];
    const r = await runResearch({ topic: 'cheap_food', query: 'student food deals' }, { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31', onFallback: (x) => reasons.push(x) });
    expect(r.sample).toBe(true);
    expect(r.label).toMatch(/Sample/);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.sourceUrl.startsWith('http'))).toBe(true);
    expect(reasons).toHaveLength(1);
    // primary model + fallback model both tried
    expect(f.calls.map((c) => c.url.match(/models\/([^:]+)/)![1])).toEqual(['gemini-4-argon', 'gemini-3.5-flash']);
    const again = await runResearch({ topic: 'cheap_food', query: 'x' }, { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31' });
    expect(again.cached).toBeUndefined();
  });

  it('hedges: if argon is slow, gemini-3.5-flash starts and the first grounded answer wins', async () => {
    const seen: string[] = [];
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const model = String(u).match(/models\/([^:]+)/)![1];
      seen.push(model);
      if (model === 'gemini-4-argon') return hangingFetch(u, init);
      if (model === 'gemini-3.5-flash') return geminiResponse([{ text: GROUNDED_TEXT }], { groundingMetadata: gm });
      return geminiResponse([{ text: JSON.stringify(EXTRACTED) }]);
    }) as typeof fetch;
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: f, today: '2026-10-31', hedgeAfterMs: 10 });
    expect(r).toMatchObject({ sample: false, model: 'gemini-3.5-flash' });
    expect(seen).toEqual(['gemini-4-argon', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('falls back when no extracted item has a citation', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ text: GROUNDED_TEXT }], { groundingMetadata: gm }),
      () => geminiResponse([{ text: JSON.stringify({ items: [{ ...EXTRACTED.items[2] }] }) }]),
    ]);
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31' });
    expect(r.sample).toBe(true);
    expect(r.items).toEqual([]); // no curated savings-rate samples exist
  });

  it('falls back without a key and makes no network call', async () => {
    const f = scriptedFetch([() => geminiResponse([])]);
    const r = await runResearch({ topic: 'transport_savings', query: 'railcard' }, { apiKey: '', fetchImpl: f.impl, today: '2026-10-31' });
    expect(r.sample).toBe(true);
    expect(r.items.length).toBeGreaterThan(0);
    expect(f.calls).toHaveLength(0);
  });
});
