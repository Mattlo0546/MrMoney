import { beforeEach, describe, expect, it } from 'vitest';
import { annotateCitations, cacheKey, CACHE_TTL_MS, citeItems, clearResearchCache, parseExtracted, runResearch } from './research';
import { geminiResponse, hangingFetch, scriptedFetch } from './testkit';

const LINES = ['* Zopa Easy Access: 4.56% AER variable.', '* Chase Saver: 4.50% AER with bonus.', '* Cahoot Simple Saver: 5.00% AER.'];
const GROUNDED_TEXT = LINES.join('\n');
const byteEnd = (i: number) => Buffer.byteLength(LINES.slice(0, i + 1).join('\n'), 'utf8');
const gm = {
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/1', title: 'moneysavingexpert.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/2', title: 'moneysupermarket.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/3', title: 'savethestudent.org' } },
  ],
  groundingSupports: LINES.map((_, i) => ({ segment: { startIndex: 0, endIndex: byteEnd(i) }, groundingChunkIndices: [i] })),
};
const EXTRACTED = {
  items: [
    { provider: 'Zopa', product: 'Easy Access', headline: '4.56% AER variable', ratePercent: 4.56, conditions: ['New customers'], sourceIndex: 1 },
    { provider: 'Chase', product: 'Saver', headline: '4.50% AER', ratePercent: 4.5, conditions: [], sourceIndex: 2 },
    { provider: 'Cahoot', product: 'Simple Saver', headline: '5.00% AER', ratePercent: 5, conditions: [], sourceIndex: 3 },
    { provider: 'Ghost Bank', product: 'Made up', headline: '9% AER', ratePercent: 9, conditions: [], sourceIndex: null },
    { provider: 'Out of range', product: 'X', headline: '5%', ratePercent: 5, conditions: [], sourceIndex: 7 },
  ],
};
const modelOf = (u: RequestInfo | URL) => String(u).match(/models\/([^:]+)/)![1];

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
    expect(items.map((i) => i.provider)).toEqual(['Zopa', 'Chase', 'Cahoot']);
    expect(items[0]).toMatchObject({ sourceUrl: gm.groundingChunks[0].web.uri, sourceTitle: 'moneysavingexpert.com', ratePercent: 4.56 });
  });
  it('drops a rate that does not appear in the grounded text', () => {
    const [it0] = citeItems([{ provider: 'Zopa', product: 'EA', headline: 'h', ratePercent: 6.1, conditions: [], sourceIndex: 1 }], gm, GROUNDED_TEXT);
    expect(it0.ratePercent).toBeUndefined();
  });
  it('compares rates numerically: "5.00%" in the text supports 5, "4.50%" supports 4.5', () => {
    const items = citeItems(EXTRACTED.items, gm, GROUNDED_TEXT);
    expect(items.map((i) => i.ratePercent)).toEqual([4.56, 4.5, 5]);
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
    expect(r.items).toHaveLength(3);
    expect(r.model).toBe('gemini-3.5-flash');
    expect((f.calls[0].body.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
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
    expect(f.calls.map((c) => modelOf(c.url))).toEqual(['gemini-3.5-flash', 'gemini-3.8-flash']);
    const again = await runResearch({ topic: 'cheap_food', query: 'x' }, { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31' });
    expect(again.cached).toBeUndefined();
  });

  it('hedges: if flash is slow, gemini-3.8-flash starts; the first good answer wins and the loser is cancelled', async () => {
    const seen: string[] = [];
    let loser: AbortSignal | undefined;
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const model = modelOf(u);
      seen.push(model);
      if (model === 'gemini-3.5-flash') {
        loser = init?.signal ?? undefined;
        return hangingFetch(u, init);
      }
      if (model === 'gemini-3.8-flash') return geminiResponse([{ text: GROUNDED_TEXT }], { groundingMetadata: gm });
      return geminiResponse([{ text: JSON.stringify(EXTRACTED) }]);
    }) as typeof fetch;
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: f, today: '2026-10-31', hedgeAfterMs: 10 });
    expect(r).toMatchObject({ sample: false, model: 'gemini-3.8-flash' });
    expect(seen).toEqual(['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    expect(loser?.aborted).toBe(true);
  });

  it('an attempt with fewer than 3 cited items starts the other model; the better result wins', async () => {
    const two = { items: EXTRACTED.items.slice(0, 2) };
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const model = modelOf(u);
      const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
      if (model === 'gemini-3.5-flash-lite') {
        // the extraction prompt carries the grounded text; the 3.8 text has a marker
        const isSecond = body.contents[0].parts[0].text.includes('Cahoot');
        return geminiResponse([{ text: JSON.stringify(isSecond ? EXTRACTED : two) }]);
      }
      const text = model === 'gemini-3.8-flash' ? GROUNDED_TEXT : LINES.slice(0, 2).join('\n');
      return geminiResponse([{ text }], { groundingMetadata: gm });
    }) as typeof fetch;
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: f, today: '2026-10-31' });
    expect(r).toMatchObject({ sample: false, model: 'gemini-3.8-flash' });
    expect(r.items).toHaveLength(3);
  });

  it('extraction is lenient: too many conditions are clipped, malformed items are skipped', () => {
    const raw = JSON.stringify({ items: [
      { provider: 'A', product: 'B', headline: '4% AER', conditions: ['1', '2', '3', '4', '5', '6', '7'], sourceIndex: 1, ratePercent: 'x' },
      { product: 'no provider', headline: 'h', conditions: [], sourceIndex: 1 },
    ] });
    const items = parseExtracted(raw);
    expect(items).toHaveLength(1);
    expect(items[0].conditions).toHaveLength(4);
    expect(items[0].ratePercent).toBeNull();
  });

  it('on failure, a previous live result (even past the TTL) beats the sample fallback', async () => {
    const ok = liveFetch();
    const first = await runResearch(args, { apiKey: 'k', fetchImpl: ok.impl, today: '2026-10-31', now: () => T0 });
    const bad = scriptedFetch([() => new Response('err', { status: 500 })]);
    const later = new Date(T0.getTime() + CACHE_TTL_MS + 60_000);
    const r = await runResearch(args, { apiKey: 'k', fetchImpl: bad.impl, today: '2026-10-31', now: () => later });
    expect(bad.calls.length).toBeGreaterThan(0);
    expect(r).toMatchObject({ sample: false, cached: true, retrievedAt: T0.toISOString() });
    expect(r.items).toEqual(first.items);
  });

  it('concurrent requests for the same key share one search', async () => {
    const f = liveFetch();
    const d = { apiKey: 'k', fetchImpl: f.impl, today: '2026-10-31' };
    const [a, b] = await Promise.all([runResearch(args, d), runResearch({ ...args, query: 'other words' }, d)]);
    expect(f.calls).toHaveLength(2);
    expect(a.items).toEqual(b.items);
    expect(b.query).toBe('other words');
  });

  it('falls back when no extracted item has a citation', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ text: GROUNDED_TEXT }], { groundingMetadata: gm }),
      () => geminiResponse([{ text: JSON.stringify({ items: [{ ...EXTRACTED.items[3] }] }) }]),
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
