/**
 * Builds the itinerary catalogue (products, recipes, TfL fares, wants) from Google Search–grounded research, merged
 * over the curated fallback catalogue so the result is always complete.
 *
 * Four grounded searches run IN PARALLEL (two recipe/ingredient-price searches, TfL fares, wants), each followed by a
 * structured-extraction call (JSON responseSchema). Each part is hedged (gemini-3.5-flash first, gemini-3.8-flash
 * after HEDGE_AFTER_MS or on failure) and the whole build shares one deadline (CATALOG_DEADLINE_MS). Recipes are split
 * across two searches because the extraction output (~8 recipes × ~7 priced ingredients) is the latency bottleneck.
 *
 * Source URLs come only from groundingChunks, and a price counts as grounded only when it appears in a text segment
 * that the cited chunk supports. Anything else gets the retailer's search URL for that exact product and
 * confidence 'low'. Cached in memory for 6h per prefs. Never throws: any failure returns the fallback catalogue.
 */
import { z } from 'zod';
import { generateContent, visibleText, type GroundingMetadata } from '@/lib/agent/gemini';
import { annotateCitations, EXTRACT_MODEL, RESEARCH_FALLBACK_MODEL, RESEARCH_MODEL, THINKING } from '@/lib/agent/research';
import {
  bbcGoodFoodSearch, catalogueProducts, dietAllows, fallbackCatalog, fareId, finalizeCatalog, matchProductId, normaliseLine, productSearchUrl,
  retailerFor, slug, TFL_BUS_FARES_URL, TFL_FARES_URL, wantProductId,
} from './fallback';
import type { Catalog, CatalogProduct, CatalogRequest, ItineraryPrefs, Recipe, TransportFare } from './types';

export const CATALOG_DEADLINE_MS = 23_000;
export const HEDGE_AFTER_MS = 10_000;
export const EXTRACT_TIMEOUT_MS = 10_000;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Sanity clamps (pence). Out-of-range live prices are dropped. */
export const PRICE_RANGE = { ingredient: [10, 3000], equipment: [100, 6000], fare: [50, 1500], want: [100, 40000] } as const;

export type Trace = (event: string, data?: Record<string, unknown>) => void;

export interface CatalogDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  today: string;
  now?: () => Date;
  trace?: Trace;
  /** Overrides (tests). */
  deadlineMs?: number;
  hedgeAfterMs?: number;
}

type Part = 'recipesA' | 'recipesB' | 'fares' | 'wants';

// ------------------------------------------------------------------ cache

const cache = new Map<string, { at: number; catalog: Catalog }>();
const inflight = new Map<string, Promise<Catalog>>();
export function clearCatalogCache() {
  cache.clear();
  inflight.clear();
}

export function prefsKey(p: ItineraryPrefs): string {
  const norm = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean).sort();
  return JSON.stringify([norm(p.cuisines), (p.diet ?? '').trim().toLowerCase(), norm(p.lines), p.homeStation.trim().toLowerCase(), p.campusStation.trim().toLowerCase(), norm(p.wants)]);
}

// ------------------------------------------------------------------ grounding helpers

interface Source { url: string; title: string; domain: string }

const DOMAIN_RE = /^(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

/** The chunk's URL (often a vertexaisearch redirect) and its domain, taken from the chunk title when it is a domain. */
export function chunkSource(gm: GroundingMetadata | undefined, index1: number | null | undefined): Source | undefined {
  if (index1 == null) return undefined;
  const c = gm?.groundingChunks?.[index1 - 1]?.web;
  const uri = c?.uri;
  if (!uri || !/^https:\/\//.test(uri)) return undefined;
  const title = c?.title?.trim() ?? '';
  let domain = DOMAIN_RE.exec(title)?.[1]?.toLowerCase();
  if (!domain) {
    try {
      const host = new URL(uri).hostname.replace(/^www\./, '');
      if (!/vertexaisearch|googleapis|google\.com$/.test(host)) domain = host;
    } catch { /* ignore */ }
  }
  return { url: uri, title: title || domain || 'source', domain: domain ?? 'source' };
}

const numbers = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((m) => Number(m.replace(/,/g, ''))).filter(Number.isFinite);

/** chunk index (1-based) -> numbers written in the text segments that chunk supports. */
export function supportedNumbers(text: string, gm: GroundingMetadata | undefined): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const buf = Buffer.from(text, 'utf8');
  for (const s of gm?.groundingSupports ?? []) {
    const seg = s.segment;
    const segText = seg?.text ?? (typeof seg?.endIndex === 'number' ? buf.subarray(seg.startIndex ?? 0, seg.endIndex).toString('utf8') : '');
    for (const i of s.groundingChunkIndices ?? []) {
      const set = out.get(i + 1) ?? new Set<number>();
      numbers(segText).forEach((n) => set.add(n));
      out.set(i + 1, set);
    }
  }
  return out;
}

export interface Grounded { text: string; gm: GroundingMetadata; support: Map<number, Set<number>> }

/** A source only when the cited chunk exists AND supports a segment containing `value` (£, e.g. 2.4 for "£2.40"). */
function groundedSource(g: Grounded, index1: number | null | undefined, value: number): Source | undefined {
  const src = chunkSource(g.gm, index1);
  if (!src) return undefined;
  return g.support.get(index1!)?.has(value) ? src : undefined;
}

const penceOf = (gbp: number | null | undefined) => (typeof gbp === 'number' && Number.isFinite(gbp) ? Math.round(gbp * 100) : NaN);
const inRange = (p: number, [lo, hi]: readonly [number, number]) => Number.isInteger(p) && p >= lo && p <= hi;

// ------------------------------------------------------------------ model calls

type D = CatalogDeps & { apiKey: string };

async function groundedSearch(part: Part, sys: string, prompt: string, d: D, model: string, timeoutMs: number, signal: AbortSignal): Promise<Grounded> {
  const t = Date.now();
  const res = await generateContent({
    apiKey: d.apiKey, model, fetchImpl: d.fetchImpl, timeoutMs, signal,
    body: {
      systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 2500, ...(THINKING[model] ? { thinkingConfig: { thinkingLevel: THINKING[model] } } : {}) },
    },
  });
  const cand = res.candidates?.[0];
  const text = visibleText(cand?.content?.parts);
  const gm = cand?.groundingMetadata;
  d.trace?.('search', { part, model, ms: Date.now() - t, textLen: text.length, chunks: gm?.groundingChunks?.length ?? 0, supports: gm?.groundingSupports?.length ?? 0, queries: gm?.webSearchQueries });
  if (!text || !gm?.groundingChunks?.length) throw new Error(`No grounded answer (${part}, ${model})`);
  return { text, gm, support: supportedNumbers(text, gm) };
}

async function extractJson(part: Part, g: Grounded, instructions: string, schema: Record<string, unknown>, d: D, timeoutMs: number, signal: AbortSignal): Promise<unknown> {
  const t = Date.now();
  const sources = (g.gm.groundingChunks ?? []).map((c, i) => `[${i + 1}] ${c.web?.title ?? 'source'}`).join('\n');
  const res = await generateContent({
    apiKey: d.apiKey, model: EXTRACT_MODEL, fetchImpl: d.fetchImpl, timeoutMs, signal,
    body: {
      systemInstruction: { parts: [{ text: `${instructions}\nCopy names and figures exactly from the text; never invent or compute prices. sourceIndex is the [n] number cited next to the figure in the text, or null if none.` }] },
      contents: [{ role: 'user', parts: [{ text: `TEXT:\n${annotateCitations(g.text, g.gm)}\n\nSOURCES:\n${sources}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 6000, thinkingConfig: { thinkingLevel: 'minimal' } },
    },
  });
  const raw = visibleText(res.candidates?.[0]?.content?.parts);
  d.trace?.('extract', { part, ms: Date.now() - t, rawLen: raw.length });
  return JSON.parse(raw) as unknown;
}

/** Primary model first; the fallback model starts after `hedgeAfterMs` or when the primary fails. First success wins. */
function hedged<T>(part: Part, d: D, deadline: number, run: (model: string, signal: AbortSignal) => Promise<T>): Promise<T> {
  const models = [RESEARCH_MODEL, RESEARCH_FALLBACK_MODEL];
  const ctls = models.map(() => new AbortController());
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let launched = 0;
    let failed = 0;
    const settle = () => {
      done = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadlineTimer);
      ctls.forEach((c) => c.abort());
    };
    const launch = () => {
      if (done || launched >= models.length) return;
      const i = launched++;
      run(models[i], ctls[i].signal).then(
        (v) => {
          if (done) return;
          settle();
          resolve(v);
        },
        (e: unknown) => {
          if (done) return;
          d.trace?.('attempt_failed', { part, model: models[i], message: e instanceof Error ? e.message : String(e) });
          failed++;
          if (failed >= models.length) {
            settle();
            reject(e);
          } else launch();
        },
      );
    };
    const hedgeTimer = setTimeout(launch, d.hedgeAfterMs ?? HEDGE_AFTER_MS);
    const deadlineTimer = setTimeout(() => {
      if (done) return;
      settle();
      reject(new Error(`${part}: deadline`));
    }, Math.max(0, deadline - Date.now()));
    launch();
  });
}

// ------------------------------------------------------------------ schemas (lenient per item)

const str = (max: number) => z.string().transform((x) => x.trim().slice(0, max));
const num = z.number().nullish().catch(null);
const int = z.number().int().nullish().catch(null);
const lenientArray = <T extends z.ZodType>(item: T) =>
  z.array(z.unknown()).catch([]).transform((xs) => xs.flatMap((x) => {
    const r = item.safeParse(x);
    return r.success ? [r.data as z.infer<T>] : [];
  }));

const IngredientSchema = z.object({
  item: str(60), product: str(120).pipe(z.string().min(2)), merchant: str(40).pipe(z.string().min(2)), packSize: str(30).nullish().catch(null),
  priceGBP: num, qty: str(40).catch(''), portion: num, kind: z.enum(['fresh', 'staple']).catch('fresh'), sourceIndex: int,
});
const RecipeSchema = z.object({
  name: str(80).pipe(z.string().min(3)), cuisine: str(30).catch('Other'), meal: z.enum(['breakfast', 'lunch', 'dinner']).catch('dinner'),
  tier: z.enum(['budget', 'standard', 'treat']).catch('standard'), recipeSourceIndex: int,
  equipment: z.array(z.string()).catch([]), meat: z.boolean().catch(false), pork: z.boolean().catch(false), fish: z.boolean().catch(false),
  ingredients: lenientArray(IngredientSchema),
});
export const RecipesExtractSchema = z.object({ recipes: lenientArray(RecipeSchema) });
const FareSchema = z.object({ line: str(60), zones: str(30).catch('Zones 1-2'), peakGBP: num, offPeakGBP: num, dailyCapGBP: num, sourceIndex: int });
export const FaresExtractSchema = z.object({ fares: lenientArray(FareSchema) });
const WantSchema = z.object({
  wantNumber: z.number().int(), product: str(120).pipe(z.string().min(2)), merchant: str(40).pipe(z.string().min(2)),
  priceGBP: num, size: str(30).nullish().catch(null), sourceIndex: int,
});
export const WantsExtractSchema = z.object({ items: lenientArray(WantSchema) });

const S = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });
const recipesResponseSchema = S('OBJECT', {
  properties: {
    recipes: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          name: S('STRING'), cuisine: S('STRING'), meal: S('STRING', { enum: ['breakfast', 'lunch', 'dinner'] }), tier: S('STRING', { enum: ['budget', 'standard', 'treat'] }),
          recipeSourceIndex: S('INTEGER', { nullable: true }),
          equipment: S('ARRAY', { items: S('STRING', { enum: ['frying pan', 'wok', 'saucepan', 'baking tray'] }) }),
          meat: S('BOOLEAN'), pork: S('BOOLEAN'), fish: S('BOOLEAN'),
          ingredients: S('ARRAY', {
            items: S('OBJECT', {
              properties: {
                item: S('STRING', { description: 'Generic ingredient, e.g. "oyster sauce"' }),
                product: S('STRING', { description: 'Exact supermarket product name as in the text' }),
                merchant: S('STRING', { description: "Tesco, Sainsbury's, Aldi, Lidl, Asda, Morrisons…" }),
                packSize: S('STRING', { nullable: true }), priceGBP: S('NUMBER', { nullable: true }),
                qty: S('STRING', { description: 'Amount per serving, e.g. "2 eggs", "1 tbsp"' }),
                portion: S('NUMBER', { description: 'Fraction of the pack used per serving, 0-1' }),
                kind: S('STRING', { enum: ['fresh', 'staple'], description: 'staple = sauces, oils, spices, rice, pasta that last many meals' }),
                sourceIndex: S('INTEGER', { nullable: true }),
              },
              required: ['item', 'product', 'merchant', 'priceGBP', 'qty', 'portion', 'kind', 'sourceIndex'],
            }),
          }),
        },
        required: ['name', 'cuisine', 'meal', 'tier', 'equipment', 'meat', 'pork', 'fish', 'ingredients', 'recipeSourceIndex'],
      }),
    }),
  },
  required: ['recipes'],
});
const faresResponseSchema = S('OBJECT', {
  properties: {
    fares: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          line: S('STRING', { description: 'Tube line name, or "Tube" if the fare applies to all Tube lines, or "Bus"' }),
          zones: S('STRING'), peakGBP: S('NUMBER', { nullable: true }), offPeakGBP: S('NUMBER', { nullable: true }), dailyCapGBP: S('NUMBER', { nullable: true }),
          sourceIndex: S('INTEGER', { nullable: true }),
        },
        required: ['line', 'zones', 'peakGBP', 'offPeakGBP', 'dailyCapGBP', 'sourceIndex'],
      }),
    }),
  },
  required: ['fares'],
});
const wantsResponseSchema = S('OBJECT', {
  properties: {
    items: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          wantNumber: S('INTEGER', { description: 'The numbered want this item answers' }),
          product: S('STRING'), merchant: S('STRING'), priceGBP: S('NUMBER', { nullable: true }), size: S('STRING', { nullable: true }),
          sourceIndex: S('INTEGER', { nullable: true }),
        },
        required: ['wantNumber', 'product', 'merchant', 'priceGBP', 'sourceIndex'],
      }),
    }),
  },
  required: ['items'],
});

// ------------------------------------------------------------------ prompts

const SYS = (today: string) => [
  `You research real, current UK prices for a London student's spending plan. Today is ${today}. Use Google Search.`,
  'Only state prices found in search results, in GBP, as "£x.xx". Be terse: one short line per item, no intro or summary.',
].join('\n');

function recipePrompt(p: ItineraryPrefs, half: 'A' | 'B'): string {
  const all = p.cuisines.length ? p.cuisines : ['Chinese', 'Italian', 'British'];
  // Split cuisines between the two parallel searches so they do not return the same dishes.
  const mine = all.length > 1 ? all.filter((_, i) => i % 2 === (half === 'A' ? 0 : 1)) : all;
  const diet = p.diet?.trim() ? `Diet: ${p.diet.trim()} (strictly).` : '';
  const mix = half === 'A'
    ? '4 recipes: 1 quick budget lunch, 2 budget dinners and 1 standard dinner'
    : '4 recipes: 1 quick budget lunch, 2 standard dinners and 1 treat dinner (e.g. steak, salmon, prawns)';
  return [
    `Find ${mix} that a student can cook in London. Cuisine: ${mine.join(', ')}. ${diet}`,
    'For each recipe give its name, the cookware needed (frying pan, wok, saucepan or baking tray) and up to 7 ingredients.',
    "For each ingredient: the exact product at Tesco, Sainsbury's, Aldi or Lidl, its pack size, its current price, and the amount used per serving (e.g. 2 cloves of a garlic bulb, 1 tbsp of a 150ml bottle).",
  ].join('\n');
}

function faresPrompt(p: ItineraryPrefs): string {
  const lines = p.lines.length ? p.lines.join(', ') : 'Tube';
  return [
    `Current TfL pay-as-you-go adult fares (contactless/Oyster) for travelling from ${p.homeStation} to ${p.campusStation} on the ${lines}.`,
    'Give the zones, the peak fare, the off-peak fare and the daily cap for those zones, plus the bus fare and bus daily cap.',
  ].join('\n');
}

function wantsPrompt(p: ItineraryPrefs): string {
  return [
    'For each numbered thing a London student wants, find one specific, popular, good-value option to buy or book in London or at a UK retailer, with its current price:',
    ...p.wants.slice(0, 6).map((w, i) => `${i + 1}. ${w}`),
    'Answer as: number. product — retailer — price.',
  ].join('\n');
}

// ------------------------------------------------------------------ mapping

const EQUIPMENT_IDS: Record<string, string> = { 'frying pan': 'frying-pan', wok: 'wok', saucepan: 'saucepan', 'baking tray': 'baking-tray' };

export interface LiveRecipes {
  products: CatalogProduct[];
  recipes: Recipe[];
  /** Curated product id -> factor to multiply curated recipes' portions by, when a live product (different pack) replaced it. */
  scale: Record<string, number>;
}

/** Pack quantity in grams/ml (treated alike) or a count: "2 x 200g" -> 400 g, "1L" -> 1000 ml, "6 pack" -> 6. */
export function packQty(s: string | undefined): { q: number; unit: 'mass' | 'n' } | undefined {
  const t = (s ?? '').toLowerCase().replace(/,/g, '');
  const unit = (n: number, u: string) => ({ q: n * ({ kg: 1000, l: 1000, litre: 1000, litres: 1000, ltr: 1000, cl: 10 } as Record<string, number>)[u] || n, unit: 'mass' as const });
  let m = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|litres?|ltr|l)\b/.exec(t);
  if (m) return { ...unit(Number(m[2]), m[3]), q: unit(Number(m[1]) * Number(m[2]), m[3]).q };
  m = /(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|litres?|ltr|l)\b/.exec(t);
  if (m) return unit(Number(m[1]), m[2]);
  m = /(\d+)\s*(?:pack|pk|x\b|bulbs?|eggs|pieces?|fillets|rashers|sausages|wraps|count|nests)/.exec(t);
  if (m) return { q: Number(m[1]), unit: 'n' };
  if (/\beach\b|single|loose|\b1 bulb/.test(t)) return { q: 1, unit: 'n' };
  return undefined;
}

/** curated pack / live pack (both parsed, same kind of unit), else undefined. */
export function packRatio(curated: string | undefined, live: string | undefined): number | undefined {
  const a = packQty(curated);
  const b = packQty(live);
  if (!a || !b || a.unit !== b.unit || !(a.q > 0) || !(b.q > 0)) return undefined;
  return a.q / b.q;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clampPortion = (x: number, kind: CatalogProduct['kind']) => round3(Math.min(kind === 'staple' ? 0.3 : 1, Math.max(0.005, x)));

/**
 * Maps extracted recipes onto product ids. A grounded live product whose pack size is comparable REPLACES the curated
 * product for the same role (curated recipes get their portions rescaled via `scale`); otherwise it is added under its
 * own id. Ungrounded live prices never replace curated products.
 */
export function mapRecipes(raw: unknown, g: Grounded, prefs: ItineraryPrefs, base: Record<string, CatalogProduct>, today: string): LiveRecipes {
  const parsed = RecipesExtractSchema.safeParse(raw);
  const out: LiveRecipes = { products: [], recipes: [], scale: {} };
  if (!parsed.success) return out;
  const products = new Map<string, CatalogProduct>();
  for (const r of parsed.data.recipes) {
    const tags = [r.meat || r.pork ? 'meat' : '', r.pork ? 'pork' : '', r.fish ? 'fish' : '', !r.meat && !r.pork && !r.fish ? 'vegetarian' : ''].filter(Boolean);
    if (!dietAllows(prefs.diet, tags)) continue;
    const ingredients: Recipe['ingredients'] = [];
    for (const ing of r.ingredients) {
      const pence = penceOf(ing.priceGBP);
      const matched = matchProductId(`${ing.item} ${ing.product}`);
      const curated = matched && base[matched]?.kind !== 'equipment' ? base[matched] : undefined;
      if (matched && !curated && base[matched]) continue; // an "ingredient" that is really cookware
      const kind = curated?.kind ?? ing.kind;
      const livePortion = typeof ing.portion === 'number' && ing.portion > 0 ? ing.portion : kind === 'staple' ? 0.05 : 0.5;
      let live: CatalogProduct | undefined;
      if (inRange(pence, PRICE_RANGE.ingredient)) {
        const src = groundedSource(g, ing.sourceIndex, pence / 100);
        const rt = retailerFor(ing.merchant);
        live = {
          id: '', name: ing.product, merchant: rt?.name ?? ing.merchant, domain: src?.domain ?? rt?.domain ?? 'google.com', pricePence: pence,
          ...(ing.packSize ? { packSize: ing.packSize } : {}),
          url: src?.url ?? productSearchUrl(ing.merchant, ing.product), sourceTitle: src?.title ?? `${rt?.name ?? ing.merchant}: search "${ing.product}"`,
          checked: today, origin: 'research', confidence: src ? 'medium' : 'low', kind,
        };
      }
      let id: string;
      let portion = livePortion;
      const ownId = `live-${slug(ing.product)}`;
      const ratio = curated && live ? packRatio(curated.packSize, live.packSize) : undefined;
      const prevAtCurated = curated ? products.get(curated.id) : undefined;
      if (curated && live?.confidence === 'medium' && ratio && (!prevAtCurated || prevAtCurated.name === live.name)) {
        id = curated.id;
        if (!prevAtCurated) { products.set(id, { ...live, id }); out.scale[id] = ratio; }
      } else if (live && (live.confidence === 'medium' || !curated)) {
        id = ownId;
        if (!products.has(id) || (products.get(id)!.confidence === 'low' && live.confidence === 'medium')) products.set(id, { ...live, id });
      } else if (curated) {
        id = curated.id;
        // The live portion refers to the live pack; convert it to the curated pack when both sizes are known.
        const back = live ? packRatio(curated.packSize, live.packSize) : undefined;
        portion = back ? livePortion / back : livePortion;
      } else continue;
      if (!ingredients.some((x) => x.productId === id)) ingredients.push({ productId: id, qty: ing.qty || ing.item, portion: clampPortion(portion, kind) });
    }
    if (ingredients.length < 2) continue;
    const equipment = [...new Set(r.equipment.map((e) => EQUIPMENT_IDS[e.trim().toLowerCase()]).filter((x): x is string => !!x && !!base[x]))];
    if (!equipment.length && base['frying-pan']) equipment.push('frying-pan');
    const rsrc = chunkSource(g.gm, r.recipeSourceIndex);
    out.recipes.push({
      id: `live-${slug(r.name)}`, name: r.name, cuisine: r.cuisine, meal: r.meal, tier: r.tier, ingredients, equipment,
      recipeUrl: rsrc?.url ?? bbcGoodFoodSearch(r.name), tags: [...tags, 'live'],
    });
  }
  out.products = [...products.values()];
  return out;
}

/** Live fares for the student's lines (a generic "Tube" fare applies to every Tube line they use). */
export function mapFares(raw: unknown, g: Grounded, prefs: ItineraryPrefs, base: TransportFare[], today: string): TransportFare[] {
  const parsed = FaresExtractSchema.safeParse(raw);
  if (!parsed.success) return [];
  const out = new Map<string, TransportFare>();
  const tubeLines = prefs.lines.filter((l) => l !== 'Bus');
  for (const f of parsed.data.fares) {
    const named = normaliseLine(f.line);
    const targets = named ? [named] : /tube|underground|all lines|london/i.test(f.line) ? tubeLines : [];
    const isBus = named === 'Bus';
    const val = (gbp: number | null | undefined) => {
      const p = penceOf(gbp);
      return inRange(p, PRICE_RANGE.fare) && g.text && numbers(g.text).includes(p / 100) ? p : undefined;
    };
    const peak = val(f.peakGBP);
    if (peak === undefined) continue;
    const src = groundedSource(g, f.sourceIndex, peak / 100);
    for (const line of targets) {
      const fb = base.find((b) => b.line === line);
      if (!fb || (named === undefined && out.has(line))) continue;
      const offPeak = val(f.offPeakGBP) ?? (isBus ? peak : Math.min(fb.offPeakPence, peak));
      const cap = val(f.dailyCapGBP) ?? fb.dailyCapPence;
      out.set(line, {
        id: fareId(line), line, from: prefs.homeStation, to: prefs.campusStation, zones: isBus ? fb.zones : f.zones || fb.zones,
        peakPence: peak, offPeakPence: Math.min(offPeak, peak), dailyCapPence: Math.max(cap, peak),
        url: src?.url ?? (isBus ? TFL_BUS_FARES_URL : TFL_FARES_URL), sourceTitle: src?.title ?? fb.sourceTitle,
        checked: today, origin: 'research',
      });
    }
  }
  return [...out.values()];
}

/** Live products for the numbered wants (want index -> product with the same id as the fallback want product). */
export function mapWants(raw: unknown, g: Grounded, prefs: ItineraryPrefs, base: Record<string, CatalogProduct>, today: string): CatalogProduct[] {
  const parsed = WantsExtractSchema.safeParse(raw);
  if (!parsed.success) return [];
  const out = new Map<string, CatalogProduct>();
  const labels = prefs.wants.map((w) => w.trim()).filter(Boolean);
  for (const it of parsed.data.items) {
    const label = labels[it.wantNumber - 1];
    if (!label) continue;
    const id = wantProductId(it.wantNumber - 1, label);
    const pence = penceOf(it.priceGBP);
    if (!inRange(pence, PRICE_RANGE.want)) continue;
    const src = groundedSource(g, it.sourceIndex, pence / 100);
    const curated = base[id];
    if (!src && curated && curated.confidence !== 'low') continue;
    if (out.has(id) && (out.get(id)!.confidence !== 'low' || !src)) continue;
    const r = retailerFor(it.merchant);
    out.set(id, {
      id, name: it.product, merchant: r?.name ?? it.merchant, domain: src?.domain ?? r?.domain ?? 'google.com', pricePence: pence,
      ...(it.size ? { packSize: it.size } : {}),
      url: src?.url ?? productSearchUrl(it.merchant, it.product), sourceTitle: src?.title ?? `${r?.name ?? it.merchant}: search "${it.product}"`,
      checked: today, origin: 'research', confidence: src ? 'medium' : 'low', kind: 'item',
    });
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ build

interface LiveParts {
  recipes: LiveRecipes[];
  fares: TransportFare[];
  wants: CatalogProduct[];
  queries: string[];
}

const STOP = new Set(['and', 'with', 'the', 'a', 'of', 'e', 'in', 'on', 'style', 'easy', 'quick', 'simple']);
const words = (name: string) => new Set(name.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** Same dish: one name's significant words are (almost) all in the other's ("Egg fried rice" ~ "Vegetable egg fried rice"). */
export function sameDish(a: string, b: string): boolean {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return common / Math.min(A.size, B.size) >= 0.75;
}

/** Live items replace/augment the fallback; the fallback fills everything else. Exported for tests. */
export function mergeCatalog(fb: Catalog, live: LiveParts, now: Date, base: Record<string, CatalogProduct> = {}): Catalog {
  const products: Record<string, CatalogProduct> = { ...base, ...fb.products };
  const scale: Record<string, number> = {};
  let liveCount = 0;
  const liveRecipes: Recipe[] = [];
  for (const part of live.recipes) {
    const rename: Record<string, string> = {};
    for (const p of part.products) {
      const prev = products[p.id];
      if (prev?.origin === 'research' && prev.name !== p.name) {
        // Another part already replaced this curated product with a different pack: keep this one separate.
        const id = `live-${slug(p.name)}`;
        rename[p.id] = id;
        if (!products[id]) products[id] = { ...p, id };
      } else {
        products[p.id] = p;
        if (part.scale[p.id] && prev?.origin !== 'research') scale[p.id] = part.scale[p.id];
      }
      liveCount++;
    }
    for (const r of part.recipes) {
      liveRecipes.push({ ...r, ingredients: r.ingredients.map((i) => (rename[i.productId] ? { ...i, productId: rename[i.productId] } : i)) });
    }
  }
  for (const p of live.wants) { products[p.id] = p; liveCount++; }
  const kept: Recipe[] = [];
  for (const r of liveRecipes) if (!kept.some((k) => sameDish(k.name, r.name))) kept.push(r);
  const curated = fb.recipes
    .filter((r) => !kept.some((k) => sameDish(k.name, r.name)))
    .map((r) => ({
      ...r,
      ingredients: r.ingredients.map((i) => (scale[i.productId] ? { ...i, portion: clampPortion(i.portion * scale[i.productId], products[i.productId]?.kind ?? 'fresh') } : i)),
    }));
  liveCount += kept.length;
  const fares = fb.fares.map((f) => live.fares.find((l) => l.line === f.line) ?? f);
  liveCount += live.fares.length;
  return finalizeCatalog({
    products, recipes: [...kept, ...curated], fares, wants: fb.wants, live: liveCount > 0, generatedAt: now.toISOString(),
    sources: liveCount > 0 ? [...new Set(live.queries)].slice(0, 20) : fb.sources,
  });
}

async function liveBuild(prefs: ItineraryPrefs, d: D, fb: Catalog, now: Date): Promise<Catalog> {
  const t0 = Date.now();
  const deadline = t0 + (d.deadlineMs ?? CATALOG_DEADLINE_MS);
  const left = () => Math.max(500, deadline - Date.now());
  const sys = SYS(d.today);
  // Live recipes may use curated products the fallback recipe pick pruned (e.g. the wok, steak).
  const base = { ...catalogueProducts(d.today), ...fb.products };

  const run = <T>(part: Part, prompt: string, instructions: string, schema: Record<string, unknown>, map: (raw: unknown, g: Grounded) => T, ok: (t: T) => boolean) =>
    hedged(part, d, deadline, async (model, signal) => {
      const g = await groundedSearch(part, sys, prompt, d, model, left(), signal);
      const raw = await extractJson(part, g, instructions, schema, d, Math.min(EXTRACT_TIMEOUT_MS, left()), signal);
      const mapped = map(raw, g);
      if (!ok(mapped)) throw new Error(`${part}: nothing usable (${model})`);
      return { mapped, queries: g.gm.webSearchQueries ?? [] };
    });

  const recipeInstr = 'Extract every recipe with its ingredients (exact supermarket product, merchant, pack size, price in GBP as a number, amount per serving) and cookware. portion = the fraction of ONE pack used per serving: 2 eggs of a 6 pack = 0.333, 2 cloves of a garlic bulb = 0.2, 1 tbsp of a 150ml bottle = 0.1, 100g of a 1kg bag = 0.1.';
  const tasks = [
    run('recipesA', recipePrompt(prefs, 'A'), recipeInstr, recipesResponseSchema, (raw, g) => mapRecipes(raw, g, prefs, base, d.today), (r) => r.recipes.length > 0),
    run('recipesB', recipePrompt(prefs, 'B'), recipeInstr, recipesResponseSchema, (raw, g) => mapRecipes(raw, g, prefs, base, d.today), (r) => r.recipes.length > 0),
    run('fares', faresPrompt(prefs), 'Extract each TfL pay-as-you-go fare: the line (or "Tube" if it applies to all Tube lines, or "Bus"), zones, peak, off-peak and daily cap in GBP as numbers.', faresResponseSchema, (raw, g) => mapFares(raw, g, prefs, fb.fares, d.today), (f) => f.length > 0),
    prefs.wants.some((w) => w.trim())
      ? run('wants', wantsPrompt(prefs), 'Extract one item per numbered want: wantNumber, product, merchant, price in GBP as a number, size if stated.', wantsResponseSchema, (raw, g) => mapWants(raw, g, prefs, fb.products, d.today), (w) => w.length > 0)
      : Promise.reject(new Error('no wants')),
  ] as const;
  const [ra, rb, fares, wants] = await Promise.allSettled(tasks);
  const queries: string[] = [];
  const take = <T>(r: PromiseSettledResult<{ mapped: T; queries: string[] }>) => {
    if (r.status !== 'fulfilled') return undefined;
    queries.push(...r.value.queries);
    return r.value.mapped;
  };
  const parts: LiveParts = {
    recipes: [take(ra), take(rb)].filter((x): x is LiveRecipes => !!x),
    fares: take(fares) ?? [],
    wants: take(wants) ?? [],
    queries,
  };
  d.trace?.('parts', {
    ms: Date.now() - t0,
    status: { recipesA: ra.status, recipesB: rb.status, fares: fares.status, wants: wants.status },
    errors: [ra, rb, fares, wants].flatMap((r) => (r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [])),
  });
  return mergeCatalog(fb, parts, now, base);
}

/** The itinerary catalogue for these prefs: live grounded research merged over the curated fallback. Never throws. */
export async function buildCatalog(req: CatalogRequest, deps: CatalogDeps): Promise<Catalog> {
  const now = deps.now?.() ?? new Date();
  const today = req.today || deps.today;
  let fb: Catalog;
  try {
    fb = fallbackCatalog(req.prefs, today);
  } catch {
    fb = fallbackCatalog({ ...req.prefs, wants: [] }, today);
  }
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) {
    deps.trace?.('fallback', { reason: 'no key' });
    return fb;
  }
  const key = prefsKey(req.prefs);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.catalog;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const c = await liveBuild(req.prefs, { ...deps, today, apiKey }, fb, now);
      if (c.live) cache.set(key, { at: now.getTime(), catalog: c });
      else return cache.get(key)?.catalog ?? c;
      return c;
    } catch (e) {
      deps.trace?.('error', { message: e instanceof Error ? e.message : String(e) });
      return cache.get(key)?.catalog ?? fb;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
