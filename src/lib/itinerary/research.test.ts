import { beforeEach, describe, expect, it } from 'vitest';
import { geminiResponse, hangingFetch, scriptedFetch, type FetchCall } from '@/lib/agent/testkit';
import { fallbackCatalog, matchProductId, pickRecipes, fallbackRecipes } from './fallback';
import { buildCatalog, clearCatalogCache, packQty, packRatio, sameDish, supportedNumbers } from './research';
import { DEFAULT_PREFS, TUBE_LINES, type Catalog, type ItineraryPrefs } from './types';

const TODAY = '2026-10-31';
const PREFS: ItineraryPrefs = {
  ...DEFAULT_PREFS,
  cuisines: ['Chinese', 'Italian'],
  lines: ['Circle line', 'District line'],
  homeStation: "King's Cross St. Pancras",
  campusStation: 'South Kensington',
  wants: ['new trainers'],
};

function expectIntegrity(c: Catalog) {
  const ids = new Set(Object.keys(c.products));
  for (const r of c.recipes) {
    expect(r.ingredients.length).toBeGreaterThan(0);
    for (const i of r.ingredients) {
      expect(ids.has(i.productId), `${r.id} -> ${i.productId}`).toBe(true);
      expect(i.portion).toBeGreaterThan(0);
      expect(i.portion).toBeLessThanOrEqual(1);
      expect(c.products[i.productId].kind).not.toBe('equipment');
    }
    for (const e of r.equipment) {
      expect(ids.has(e), `${r.id} equipment ${e}`).toBe(true);
      expect(c.products[e].kind).toBe('equipment');
    }
    if (r.recipeUrl) expect(r.recipeUrl).toMatch(/^https:\/\//);
  }
  for (const w of c.wants) expect(ids.has(w.productId), w.productId).toBe(true);
  for (const [id, p] of Object.entries(c.products)) {
    expect(p.id).toBe(id);
    expect(Number.isInteger(p.pricePence) && p.pricePence > 0, `${id} price`).toBe(true);
    expect(p.url, id).toMatch(/^https:\/\/[^\s]+$/);
    expect(p.domain.length).toBeGreaterThan(0);
  }
  expect(c.fares.map((f) => f.line).sort()).toEqual([...TUBE_LINES].sort());
  for (const f of c.fares) {
    expect(f.url).toMatch(/^https:\/\//);
    for (const n of [f.peakPence, f.offPeakPence, f.dailyCapPence]) expect(Number.isInteger(n) && n > 0).toBe(true);
    expect(f.offPeakPence).toBeLessThanOrEqual(f.peakPence);
    expect(f.dailyCapPence).toBeGreaterThanOrEqual(f.peakPence);
  }
}

beforeEach(() => clearCatalogCache());

describe('fallbackCatalog', () => {
  it('is complete and internally consistent', () => {
    const c = fallbackCatalog(DEFAULT_PREFS, TODAY);
    expectIntegrity(c);
    expect(c.live).toBe(false);
    expect(c.recipes.length).toBeGreaterThanOrEqual(8);
    expect(new Set(c.recipes.map((r) => r.meal))).toEqual(new Set(['breakfast', 'lunch', 'dinner']));
    expect(c.recipes.some((r) => r.tier === 'treat')).toBe(true);
    expect(Object.values(c.products).every((p) => p.origin === 'catalogue' && p.checked === TODAY)).toBe(true);
    expect(c.fares.every((f) => f.url.startsWith('https://tfl.gov.uk/fares/'))).toBe(true);
    expect(c.fares.find((f) => f.line === 'Circle line')).toMatchObject({ peakPence: 290, offPeakPence: 280, dailyCapPence: 890, from: DEFAULT_PREFS.homeStation, to: DEFAULT_PREFS.campusStation });
    expect(c.fares.find((f) => f.line === 'Bus')).toMatchObject({ peakPence: 175, dailyCapPence: 525 });
  });

  it('marks staples and equipment so the plan can ask "do you already have X?"', () => {
    const c = fallbackCatalog({ ...DEFAULT_PREFS, cuisines: ['Chinese'] }, TODAY);
    expect(c.products['oyster-sauce']).toMatchObject({ kind: 'staple', url: 'https://www.tesco.com/groceries/en-GB/search?query=lee+kum+kee+oyster+sauce' });
    expect(c.products.wok.kind).toBe('equipment');
    expect(c.products.eggs.kind).toBe('fresh');
  });

  it('works for every cuisine, diet and odd wants', () => {
    for (const cuisines of [[], ['Korean'], ['Japanese', 'Mexican'], ['Indian'], ['Thai']]) {
      for (const diet of [undefined, 'vegetarian', 'vegan', 'pescatarian', 'halal']) {
        const c = fallbackCatalog({ ...PREFS, cuisines, diet, wants: ['running shoes', 'a ramen dinner out', 'gig tickets', 'a kite'] }, TODAY);
        expectIntegrity(c);
        expect(c.recipes.length, `${cuisines} ${diet}`).toBeGreaterThanOrEqual(diet === 'vegan' || diet === 'vegetarian' ? 6 : 8);
      }
    }
  });

  it('prefers the student cuisines and respects vegetarian', () => {
    const r = fallbackRecipes({ cuisines: ['Korean', 'Japanese'], diet: 'vegetarian' });
    expect(r.every((x) => x.tags?.includes('vegetarian'))).toBe(true);
    const k = pickRecipes(fallbackRecipes({ cuisines: [] }), { cuisines: ['Italian'] });
    expect(k.slice(0, 3).every((x) => x.cuisine === 'Italian')).toBe(true);
    expect(k.length).toBeGreaterThanOrEqual(8);
  });

  it('maps wants to specific items and unknown wants to a generic matched item', () => {
    const c = fallbackCatalog({ ...PREFS, wants: ['new trainers', 'dinner out at a nice restaurant', 'gig', 'a pottery class'] }, TODAY);
    const items = c.wants.map((w) => ({ ...w, p: c.products[w.productId] }));
    expect(items[0]).toMatchObject({ bucket: 'shopping', p: { merchant: 'JD Sports', kind: 'item' } });
    expect(items[0].p.url).toMatch(/^https:\/\/www\.jdsports\.co\.uk\/search\//);
    expect(items[1]).toMatchObject({ bucket: 'eatingOut', p: { merchant: 'Dishoom' } });
    expect(items[2].bucket).toBe('fun');
    expect(items[3].p).toMatchObject({ confidence: 'low', kind: 'item' });
  });

  it('matches live product names to catalogue roles', () => {
    expect(matchProductId('Lee Kum Kee Panda Oyster Sauce 510g')).toBe('oyster-sauce');
    expect(matchProductId('Egg noodles Tesco')).toBe('egg-noodles');
    expect(matchProductId('Spring onions bunch')).toBe('spring-onions');
    expect(matchProductId('Coconut milk 400ml')).toBe('coconut-milk');
  });
});

describe('helpers', () => {
  it('parses pack sizes and ratios', () => {
    expect(packQty('2 x 200g')).toEqual({ q: 400, unit: 'mass' });
    expect(packQty('1L')).toEqual({ q: 1000, unit: 'mass' });
    expect(packQty('6 pack')).toEqual({ q: 6, unit: 'n' });
    expect(packRatio('500ml', '150ml')).toBeCloseTo(3.333, 2);
    expect(packRatio('4 pack', '1 bulb')).toBe(4);
    expect(packRatio('500g', '6 pack')).toBeUndefined();
  });
  it('detects the same dish', () => {
    expect(sameDish('Egg fried rice', 'Vegetable Egg Fried Rice')).toBe(true);
    expect(sameDish('Chicken and Broccoli Stir-Fry', 'Chicken & broccoli stir fry')).toBe(true);
    expect(sameDish('Spaghetti bolognese', 'Spaghetti aglio e olio')).toBe(false);
  });
  it('collects numbers per supporting chunk (UTF-8 byte offsets)', () => {
    const text = 'Oyster sauce £2.50. Soy £1.20.';
    const end1 = Buffer.byteLength('Oyster sauce £2.50.', 'utf8');
    const m = supportedNumbers(text, { groundingSupports: [{ segment: { startIndex: 0, endIndex: end1 }, groundingChunkIndices: [1] }] });
    expect([...m.get(2)!]).toEqual([2.5]);
    expect(m.get(1)).toBeUndefined();
  });
});

// ------------------------------------------------------------------ live path (mocked Gemini)

/** Grounded text built from lines, each line supported by the given chunk index (or none). */
function grounded(lines: [string, number | null][], chunks: { uri: string; title: string }[], queries: string[]) {
  const text = lines.map(([l]) => l).join('\n');
  let pos = 0;
  const supports = lines.flatMap(([l, chunk], i) => {
    const start = pos;
    pos += Buffer.byteLength(l, 'utf8') + (i < lines.length - 1 ? 1 : 0);
    return chunk == null ? [] : [{ segment: { startIndex: start, endIndex: start + Buffer.byteLength(l, 'utf8'), text: l }, groundingChunkIndices: [chunk] }];
  });
  return geminiResponse([{ text }], { groundingMetadata: { groundingChunks: chunks.map((c) => ({ web: c })), groundingSupports: supports, webSearchQueries: queries } });
}

const R = (n: number) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${n}`;
const RECIPE_CHUNKS = [{ uri: R(1), title: 'tesco.com' }, { uri: R(2), title: 'bbcgoodfood.com' }, { uri: 'http://insecure.example/x', title: 'insecure.example' }];
const RECIPE_LINES: [string, number | null][] = [
  ['Oyster beef noodles (Chinese, wok). Lee Kum Kee Panda Oyster Sauce 510g at Tesco £2.50.', 0],
  ['Recipe from BBC Good Food.', 1],
  ['Tesco Beef Mince 500g £3.25.', 0],
  ['Sesame noodles: Tesco Medium Egg Noodles 250g £0.95.', null],
  ['Kikkoman soy sauce 150ml £1.99.', 2],
];
const RECIPE_JSON = {
  recipes: [{
    name: 'Oyster sauce beef noodles', cuisine: 'Chinese', meal: 'dinner', tier: 'standard', recipeSourceIndex: 2, equipment: ['wok'], meat: true, pork: false, fish: false,
    ingredients: [
      { item: 'oyster sauce', product: 'Lee Kum Kee Panda Oyster Sauce', merchant: 'Tesco', packSize: '510g', priceGBP: 2.5, qty: '2 tbsp', portion: 0.06, kind: 'staple', sourceIndex: 1 },
      { item: 'beef mince', product: 'Tesco Beef Mince 20% Fat', merchant: 'Tesco', packSize: '500g', priceGBP: 3.25, qty: '125g', portion: 0.25, kind: 'fresh', sourceIndex: 1 },
      // Price cited to a chunk whose segment does not contain it -> not grounded, curated kept.
      { item: 'egg noodles', product: 'Tesco Medium Egg Noodles', merchant: 'Tesco', packSize: '250g', priceGBP: 0.95, qty: '2 nests', portion: 0.5, kind: 'fresh', sourceIndex: 1 },
      // Unknown to the catalogue and ungrounded (http chunk) -> retailer search URL, low confidence.
      { item: 'black vinegar', product: 'Gold Plum Chinkiang Vinegar', merchant: "Sainsbury's", packSize: '550ml', priceGBP: 2.2, qty: '1 tsp', portion: 0.02, kind: 'staple', sourceIndex: 3 },
      // Out of range price -> dropped.
      { item: 'saffron', product: 'Saffron', merchant: 'Tesco', packSize: '1g', priceGBP: 99, qty: 'pinch', portion: 0.1, kind: 'staple', sourceIndex: 1 },
    ],
  }],
};
const FARE_CHUNKS = [{ uri: R(10), title: 'tfl.gov.uk' }];
const FARE_LINES: [string, number | null][] = [['Zone 1 Tube PAYG: peak £3.10, off-peak £3.00, daily cap £9.10.', 0], ['Bus £1.75, cap £5.25.', 0]];
const FARE_JSON = { fares: [
  { line: 'Circle line', zones: 'Zone 1', peakGBP: 3.1, offPeakGBP: 3.0, dailyCapGBP: 9.1, sourceIndex: 1 },
  { line: 'Tube', zones: 'Zone 1', peakGBP: 3.1, offPeakGBP: 3.0, dailyCapGBP: 9.1, sourceIndex: 1 },
  { line: 'Bus', zones: 'any', peakGBP: 1.75, offPeakGBP: 1.75, dailyCapGBP: 5.25, sourceIndex: 1 },
] };
const WANT_CHUNKS = [{ uri: R(20), title: 'jdsports.co.uk' }];
const WANT_LINES: [string, number | null][] = [["1. Nike Air Force 1 '07 — JD Sports — £110.00", 0]];
const WANT_JSON = { items: [{ wantNumber: 1, product: "Nike Air Force 1 '07", merchant: 'JD Sports', priceGBP: 110, size: null, sourceIndex: 1 }] };

const promptOf = (c: FetchCall) => JSON.stringify(c.body.contents);
function liveResponder(c: FetchCall): Response {
  const p = promptOf(c);
  if (c.body.tools) {
    if (p.includes('recipes')) return grounded(RECIPE_LINES, RECIPE_CHUNKS, ['tesco oyster sauce price']);
    if (p.includes('TfL')) return grounded(FARE_LINES, FARE_CHUNKS, ['tfl zone 1 fare 2026']);
    return grounded(WANT_LINES, WANT_CHUNKS, ['jd sports air force 1 price']);
  }
  expect((c.body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');
  if (p.includes('Oyster beef')) return geminiResponse([{ text: JSON.stringify(RECIPE_JSON) }]);
  if (p.includes('Zone 1 Tube')) return geminiResponse([{ text: JSON.stringify(FARE_JSON) }]);
  return geminiResponse([{ text: JSON.stringify(WANT_JSON) }]);
}

describe('buildCatalog', () => {
  it('no key -> fallback, no network', async () => {
    const f = scriptedFetch([() => { throw new Error('should not call'); }]);
    const c = await buildCatalog({ prefs: PREFS, today: TODAY }, { fetchImpl: f.impl, today: TODAY });
    expect(c.live).toBe(false);
    expect(f.calls).toHaveLength(0);
    expectIntegrity(c);
  });

  it('merges grounded items (chunk URLs) over the fallback; ungrounded items get retailer search URLs', async () => {
    const f = scriptedFetch([liveResponder]);
    const c = await buildCatalog({ prefs: PREFS, today: TODAY }, { apiKey: 'k', fetchImpl: f.impl, today: TODAY });
    expectIntegrity(c);
    expect(c.live).toBe(true);
    // 4 grounded searches + 4 extractions, all with the key in the header
    expect(f.calls).toHaveLength(8);
    expect(f.calls.filter((x) => x.body.tools).length).toBe(4);
    expect(f.calls.every((x) => x.headers['x-goog-api-key'] === 'k')).toBe(true);

    expect(c.products['oyster-sauce']).toMatchObject({ origin: 'research', url: R(1), domain: 'tesco.com', pricePence: 250, confidence: 'medium', sourceTitle: 'tesco.com' });
    expect(c.products['beef-mince']).toMatchObject({ origin: 'research', name: 'Tesco Beef Mince 20% Fat', pricePence: 325, url: R(1) });
    // Not supported by its cited segment -> curated product kept.
    expect(c.products['egg-noodles']).toMatchObject({ origin: 'catalogue', pricePence: 100 });
    const vinegar = c.products['live-gold-plum-chinkiang-vinegar'];
    expect(vinegar).toMatchObject({ origin: 'research', confidence: 'low', domain: 'sainsburys.co.uk' });
    expect(vinegar.url).toBe('https://www.sainsburys.co.uk/gol-ui/SearchResults/Gold%20Plum%20Chinkiang%20Vinegar');
    expect(Object.values(c.products).some((p) => /saffron/i.test(p.name))).toBe(false);
    // Every research URL is a grounding chunk URI or a retailer search page.
    const chunkUris = new Set([...RECIPE_CHUNKS, ...FARE_CHUNKS, ...WANT_CHUNKS].map((x) => x.uri));
    for (const p of Object.values(c.products).filter((x) => x.origin === 'research')) {
      expect(p.confidence === 'medium' ? chunkUris.has(p.url) : !p.url.includes('vertexaisearch')).toBe(true);
    }

    const live = c.recipes.find((r) => r.name === 'Oyster sauce beef noodles')!;
    expect(live).toMatchObject({ recipeUrl: R(2), equipment: ['wok'], cuisine: 'Chinese' });
    expect(live.ingredients.map((i) => i.productId)).toEqual(['oyster-sauce', 'beef-mince', 'egg-noodles', 'live-gold-plum-chinkiang-vinegar']);
    // both recipe searches returned the same dish: kept once
    expect(c.recipes.filter((r) => r.name === 'Oyster sauce beef noodles')).toHaveLength(1);
    expect(c.recipes.length).toBeGreaterThanOrEqual(8);

    const circle = c.fares.find((x) => x.line === 'Circle line')!;
    expect(circle).toMatchObject({ origin: 'research', peakPence: 310, offPeakPence: 300, dailyCapPence: 910, url: R(10), from: PREFS.homeStation });
    expect(c.fares.find((x) => x.line === 'District line')).toMatchObject({ origin: 'research', peakPence: 310 });
    expect(c.fares.find((x) => x.line === 'Jubilee line')).toMatchObject({ origin: 'catalogue', peakPence: 290 });
    expect(c.fares.find((x) => x.line === 'Bus')).toMatchObject({ origin: 'research', peakPence: 175, zones: 'Any London bus' });

    const want = c.products[c.wants[0].productId];
    expect(want).toMatchObject({ origin: 'research', pricePence: 11000, url: R(20), domain: 'jdsports.co.uk', kind: 'item' });
    expect(c.sources).toEqual(expect.arrayContaining(['tesco oyster sauce price', 'tfl zone 1 fare 2026', 'jd sports air force 1 price']));
  });

  it('caches per prefs for 6 hours', async () => {
    const f = scriptedFetch([liveResponder]);
    const deps = { apiKey: 'k', fetchImpl: f.impl, today: TODAY };
    await buildCatalog({ prefs: PREFS, today: TODAY }, deps);
    const again = await buildCatalog({ prefs: { ...PREFS, cuisines: ['italian', 'chinese'] }, today: TODAY }, deps);
    expect(f.calls).toHaveLength(8);
    expect(again.live).toBe(true);
  });

  it('API failure -> fallback catalogue (never throws)', async () => {
    const f = scriptedFetch([() => new Response('err', { status: 500 })]);
    const c = await buildCatalog({ prefs: PREFS, today: TODAY }, { apiKey: 'k', fetchImpl: f.impl, today: TODAY });
    expect(c.live).toBe(false);
    expectIntegrity(c);
    expect(c.recipes.map((r) => r.id)).toEqual(fallbackCatalog(PREFS, TODAY).recipes.map((r) => r.id));
    // each part tried the primary and the hedge model
    expect(f.calls.length).toBe(8);
  });

  it('malformed extraction -> that part falls back, others still live', async () => {
    const f = scriptedFetch([(c) => (!c.body.tools && promptOf(c).includes('Oyster beef') ? geminiResponse([{ text: 'not json' }]) : liveResponder(c))]);
    const c = await buildCatalog({ prefs: PREFS, today: TODAY }, { apiKey: 'k', fetchImpl: f.impl, today: TODAY });
    expect(c.live).toBe(true);
    expectIntegrity(c);
    expect(c.products['oyster-sauce'].origin).toBe('catalogue');
    expect(c.fares.find((x) => x.line === 'Circle line')!.origin).toBe('research');
  });

  it('timeout -> fallback within the deadline', async () => {
    const t = Date.now();
    const c = await buildCatalog({ prefs: PREFS, today: TODAY }, { apiKey: 'k', fetchImpl: hangingFetch, today: TODAY, deadlineMs: 80, hedgeAfterMs: 20 });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(c.live).toBe(false);
    expectIntegrity(c);
  });
});
