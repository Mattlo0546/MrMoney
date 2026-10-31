/**
 * `research` server tool: (1) a Google Search–grounded call, (2) a cheap structured-extraction call that turns the
 * grounded text + groundingChunks into items. Every item must cite a grounding chunk URL or it is dropped.
 * Cached in memory for 6h per (topic, city) (topic 'other' also keys on the query). Falls back to the curated
 * sample catalogue (`sample: true`) on any failure.
 */
import { persistentCache } from '@/lib/cache/db';
import { z } from 'zod';
import { CuratedOfferSource, type Offer, type OfferCategory } from '@/lib/offers';
import { generateContent, visibleText, type GroundingMetadata } from './gemini';
import { RESEARCH_LABEL, SAMPLE_LABEL, type ResearchArgs, type ResearchItem, type ResearchResult, type ResearchTopic } from './types';

/**
 * Model choice (benchmarks 2026-10-31, google_search grounding, "best easy-access savings rate"):
 *   gemini-4-argon (default thinking)  grounded call 14–22s, and timed out at 26s in 1 of 6 runs
 *   gemini-4-argon (thinking low)      16–26s
 *   gemini-3.5-flash (thinking minimal) 5–9s grounded, 7–13s end to end (search + extract), 4/4 runs with 6 cited items
 *   gemini-3.8-flash (thinking low)     6–9s grounded, 12–13s end to end, comparable quality
 * Root cause of the 0-item research seen in the browser (2 of 4 runs): the argon search ran past the deadline, and the
 * flash hedge (started only at 12s, sharing the 26s deadline) had ~14s left, so both timed out. The fallback (sample
 * offers) has nothing for savings_rates, giving 0 items. A second cause was the extraction schema: one item with more than 5
 * conditions failed the WHOLE parse. Now: flash (minimal thinking) runs first; gemini-3.8-flash is hedged in after
 * HEDGE_AFTER_MS or on failure; each side runs the full pipeline (search + extract + cite), and the first one with at
 * least MIN_GOOD_ITEMS wins and cancels the other. Extraction is lenient per item. On total failure, a previous live
 * result for the same key (even if stale) is preferred over samples.
 */
export const RESEARCH_MODEL = 'gemini-3.5-flash';
export const RESEARCH_FALLBACK_MODEL = 'gemini-3.8-flash';
export const EXTRACT_MODEL = 'gemini-3.5-flash-lite';
export const HEDGE_AFTER_MS = 9_000;
export const RESEARCH_DEADLINE_MS = 24_000;
export const EXTRACT_TIMEOUT_MS = 8_000;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const MIN_GOOD_ITEMS = 3;
const MAX_ITEMS = 6;
/** Thinking level per grounded-search model (thinking dominates grounded latency). */
export const THINKING: Record<string, string> = { 'gemini-3.5-flash': 'minimal', 'gemini-3.8-flash': 'low', 'gemini-4-argon': 'low', 'gemini-3.5-flash-lite': 'minimal' };

const TOPIC_HINT: Record<ResearchTopic, string> = {
  savings_rates: 'UK easy-access and fixed savings accounts: provider, account name, AER and whether variable, key conditions (minimum deposit, withdrawals, app-only).',
  cash_isa_rates: 'UK cash ISAs: provider, ISA name, AER, flexible or not, key conditions.',
  student_bank_accounts: 'UK student bank accounts: provider, account, interest-free overdraft and perks, eligibility for international students.',
  student_deals: 'UK student discounts and deals: brand, offer, discount, how to claim (UNiDAYS, Student Beans, TOTUM), conditions.',
  cheap_food: 'Cheap food options and student food discounts: provider/brand, offer, price or discount, conditions.',
  transport_savings: 'UK student transport savings (railcards, Oyster, bus passes): product, saving, price, conditions.',
  other: 'Concrete UK options relevant to the query: provider, product, headline figure, conditions.',
};

const TOPIC_OFFER_CATEGORIES: Record<ResearchTopic, OfferCategory[]> = {
  savings_rates: [], cash_isa_rates: [], student_bank_accounts: [],
  student_deals: ['eating-out', 'groceries', 'shopping', 'transport'],
  cheap_food: ['groceries', 'eating-out'],
  transport_savings: ['transport'],
  other: ['eating-out', 'groceries', 'shopping', 'transport'],
};

export interface ResearchDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  today: string;
  model?: string;
  /** Start the fallback model after this many ms (default HEDGE_AFTER_MS). */
  hedgeAfterMs?: number;
  /** Called when falling back so the caller can log. */
  onFallback?: (reason: string) => void;
  /** Diagnostic trace (smoke runs). Never receives the key. */
  trace?: (event: string, data?: Record<string, unknown>) => void;
}

// ------------------------------------------------------------------ cache

const cache = persistentCache<{ at: number; result: ResearchResult }>('research');
export function clearResearchCache() {
  cache.clear();
}
export function cacheKey(a: ResearchArgs): string {
  const city = (a.city ?? '').trim().toLowerCase();
  return a.topic === 'other' ? `${a.topic}|${city}|${a.query.trim().toLowerCase()}` : `${a.topic}|${city}`;
}

// ------------------------------------------------------------------ extraction

const clip = (max: number) => z.string().transform((x) => x.trim().slice(0, max));
const pct = z.number().min(0).max(100).nullish().catch(null);
/** Lenient per item: long strings are clipped and extra conditions dropped instead of failing the whole parse. */
const ExtractedItemSchema = z.object({
  provider: clip(80).pipe(z.string().min(1)),
  product: clip(120).pipe(z.string().min(1)),
  headline: clip(120).pipe(z.string().min(1)),
  ratePercent: pct,
  percentOff: pct,
  conditions: z.array(z.unknown()).catch([]).transform((xs) => xs.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 4)),
  sourceIndex: z.number().int().nullish().catch(null),
});
type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

/** Parses the extraction JSON item by item; malformed items are skipped. */
export function parseExtracted(raw: string): ExtractedItem[] {
  const json = JSON.parse(raw) as unknown;
  const items = json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : [];
  return items.flatMap((it) => {
    const r = ExtractedItemSchema.safeParse(it);
    return r.success ? [r.data] : [];
  });
}

const extractResponseSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          provider: { type: 'STRING' },
          product: { type: 'STRING' },
          headline: { type: 'STRING', description: 'Short headline figure exactly as in the text, e.g. "4.75% AER variable" or "20% off with UNiDAYS"' },
          ratePercent: { type: 'NUMBER', nullable: true, description: 'Interest rate (AER) as a number, only if stated in the text' },
          percentOff: { type: 'NUMBER', nullable: true, description: 'Discount percent, only if stated in the text' },
          conditions: { type: 'ARRAY', items: { type: 'STRING' }, description: 'At most 4 short conditions' },
          sourceIndex: { type: 'INTEGER', nullable: true, description: 'The [n] source number that supports this item; null if none' },
        },
        required: ['provider', 'product', 'headline', 'conditions', 'sourceIndex'],
      },
    },
  },
  required: ['items'],
};

/** Inserts [n] citation markers (1-based chunk numbers) after each grounded segment. Indices are UTF-8 byte offsets. */
export function annotateCitations(text: string, gm: GroundingMetadata | undefined): string {
  const supports = gm?.groundingSupports ?? [];
  if (!supports.length) return text;
  const buf = Buffer.from(text, 'utf8');
  const inserts = supports
    .filter((s) => typeof s.segment?.endIndex === 'number' && s.groundingChunkIndices?.length)
    .map((s) => ({ at: Math.min(s.segment!.endIndex!, buf.length), mark: ` ${s.groundingChunkIndices!.map((i) => `[${i + 1}]`).join('')}` }))
    .sort((a, b) => a.at - b.at);
  const out: Buffer[] = [];
  let pos = 0;
  for (const ins of inserts) {
    out.push(buf.subarray(pos, ins.at), Buffer.from(ins.mark, 'utf8'));
    pos = ins.at;
  }
  out.push(buf.subarray(pos));
  return Buffer.concat(out).toString('utf8');
}

const refId = () => `r-${Math.random().toString(36).slice(2, 8)}`;

/** Every number written in the text ("5.00%", "4.5", "£1,000" -> 5, 4.5, 1000), compared numerically. */
function numbersIn(text: string): Set<number> {
  return new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((m) => Number(m.replace(/,/g, ''))).filter(Number.isFinite));
}

/** Maps extracted items onto grounding chunks; drops any without a valid chunk URL, and rates not present in the grounded text. */
export interface ExtractedLike {
  provider: string;
  product: string;
  headline: string;
  ratePercent?: number | null;
  percentOff?: number | null;
  conditions?: string[];
  sourceIndex?: number | null;
}

export function citeItems(extracted: ExtractedLike[], gm: GroundingMetadata | undefined, groundedText: string): Omit<ResearchItem, 'ref'>[] {
  const chunks = gm?.groundingChunks ?? [];
  const nums = numbersIn(groundedText);
  const out: Omit<ResearchItem, 'ref'>[] = [];
  for (const it of extracted) {
    if (it.sourceIndex == null) continue;
    const chunk = chunks[it.sourceIndex - 1];
    const uri = chunk?.web?.uri;
    if (!uri || !/^https?:\/\//.test(uri)) continue;
    // Numeric comparison, so "5.00%" in the text supports ratePercent 5 and "4.50%" supports 4.5.
    const appears = (n: number | null | undefined) => typeof n === 'number' && nums.has(n);
    let host = uri;
    try { host = new URL(uri).hostname; } catch { /* keep raw */ }
    out.push({
      provider: it.provider.trim(),
      product: it.product.trim(),
      headline: it.headline.trim(),
      ...(appears(it.ratePercent) ? { ratePercent: it.ratePercent! } : {}),
      ...(appears(it.percentOff) ? { percentOff: it.percentOff! } : {}),
      conditions: (it.conditions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 4),
      sourceUrl: uri,
      sourceTitle: chunk?.web?.title?.trim() || host,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// ------------------------------------------------------------------ live search

type D = ResearchDeps & { apiKey: string };

async function groundedSearch(args: ResearchArgs, deps: D, model: string, timeoutMs: number, signal: AbortSignal) {
  const sys = [
    `You research current UK personal-finance facts for a student budgeting app. Today is ${deps.today}. Use Google Search.`,
    `Focus: ${TOPIC_HINT[args.topic]}`,
    'List up to 6 concrete current options as short bullet lines with the exact figure from the source. Only include facts found in search results. GBP only. Never recommend specific stocks or funds.',
  ].join('\n');
  const q = args.city ? `${args.query} (city: ${args.city}, UK)` : `${args.query} (UK)`;
  const t = Date.now();
  const res = await generateContent({
    apiKey: deps.apiKey, model, fetchImpl: deps.fetchImpl, timeoutMs, signal,
    body: {
      systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: q }] }], tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 1500, ...(THINKING[model] ? { thinkingConfig: { thinkingLevel: THINKING[model] } } : {}) },
    },
  });
  const cand = res.candidates?.[0];
  const text = visibleText(cand?.content?.parts);
  const gm = cand?.groundingMetadata;
  deps.trace?.('search', { model, ms: Date.now() - t, textLen: text.length, chunks: gm?.groundingChunks?.length ?? 0, supports: gm?.groundingSupports?.length ?? 0, finish: cand?.finishReason, text: text.slice(0, 1500) });
  if (!text || !gm?.groundingChunks?.length) throw new Error(`No grounded answer (${model})`);
  return { text, gm };
}

async function extract(text: string, gm: GroundingMetadata, deps: D, timeoutMs: number, signal: AbortSignal) {
  const sources = (gm.groundingChunks ?? []).map((c, i) => `[${i + 1}] ${c.web?.title ?? 'source'}`).join('\n');
  const res = await generateContent({
    apiKey: deps.apiKey, model: EXTRACT_MODEL, fetchImpl: deps.fetchImpl, timeoutMs, signal,
    body: {
      systemInstruction: { parts: [{ text: 'Extract structured items from the grounded research text. Copy figures exactly; never invent or compute. Each item must name the [n] source number cited next to it in the text; if none is cited, use null. At most 4 short conditions per item.' }] },
      contents: [{ role: 'user', parts: [{ text: `TEXT:\n${annotateCitations(text, gm)}\n\nSOURCES:\n${sources}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: extractResponseSchema, maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: 'minimal' } },
    },
  });
  const raw = visibleText(res.candidates?.[0]?.content?.parts);
  deps.trace?.('extract', { raw: raw.slice(0, 3000) });
  return parseExtracted(raw);
}

class PartialResult extends Error {
  constructor(readonly items: Omit<ResearchItem, 'ref'>[], readonly model: string) {
    super(`Only ${items.length} cited item(s) from ${model}`);
  }
}

/** One full attempt with one model: grounded search -> extraction -> citation filter. */
async function attempt(args: ResearchArgs, d: D, model: string, deadline: number, signal: AbortSignal) {
  const left = () => Math.max(1000, deadline - Date.now());
  const g = await groundedSearch(args, d, model, left(), signal);
  const extracted = await extract(g.text, g.gm, d, Math.min(EXTRACT_TIMEOUT_MS, left()), signal);
  const items = citeItems(extracted, g.gm, g.text);
  d.trace?.('cite', { model, extracted: extracted.length, kept: items.length });
  if (items.length < MIN_GOOD_ITEMS) throw new PartialResult(items, model);
  return { items, model };
}

/**
 * Primary first; the fallback model starts after `hedgeAfterMs` or as soon as the primary fails. The first attempt
 * with >= MIN_GOOD_ITEMS cited items wins and cancels the other. If both fall short, the best partial result is used.
 */
function hedged(args: ResearchArgs, d: D, primary: string, hedgeAfterMs: number) {
  const started = Date.now();
  const deadline = started + RESEARCH_DEADLINE_MS;
  const models = primary === RESEARCH_FALLBACK_MODEL ? [primary] : [primary, RESEARCH_FALLBACK_MODEL];
  const controllers = models.map(() => new AbortController());
  return new Promise<{ items: Omit<ResearchItem, 'ref'>[]; model: string }>((resolve, reject) => {
    let settled = false;
    let launched = 0;
    let failed = 0;
    let best: PartialResult | null = null;
    let lastErr: unknown;
    const finish = () => {
      clearTimeout(timer);
      controllers.forEach((c) => c.abort());
    };
    const launch = () => {
      if (settled || launched >= models.length) return;
      const i = launched++;
      if (i > 0) d.trace?.('hedge_start', { ms: Date.now() - started, model: models[i] });
      attempt(args, d, models[i], deadline, controllers[i].signal).then(
        (r) => {
          if (settled) return;
          settled = true;
          finish();
          resolve(r);
        },
        (e: unknown) => {
          if (settled) return;
          d.trace?.('attempt_failed', { model: models[i], ms: Date.now() - started, message: e instanceof Error ? e.message : String(e) });
          if (e instanceof PartialResult && e.items.length > (best?.items.length ?? 0)) best = e;
          lastErr = e;
          failed++;
          if (failed >= models.length) {
            settled = true;
            finish();
            if (best && best.items.length) resolve({ items: best.items, model: best.model });
            else reject(lastErr);
          } else launch();
        },
      );
    };
    const timer = setTimeout(launch, hedgeAfterMs);
    launch();
  });
}

// ------------------------------------------------------------------ fallback

function offerToItem(o: Offer): ResearchItem {
  let host = o.source;
  try { host = new URL(o.source).hostname; } catch { /* keep raw */ }
  return {
    ref: o.id, provider: o.title, product: o.title, headline: o.discountDescription,
    ...(o.percentOff !== undefined ? { percentOff: o.percentOff } : {}),
    conditions: [o.eligibility, o.conditions].filter(Boolean),
    sourceUrl: o.source, sourceTitle: host,
  };
}

export async function sampleFallback(args: ResearchArgs, now: Date): Promise<ResearchResult> {
  const cats = TOPIC_OFFER_CATEGORIES[args.topic];
  const offers = cats.length ? (await new CuratedOfferSource().list({ area: args.city })).filter((o) => cats.includes(o.category)) : [];
  return {
    topic: args.topic, query: args.query, ...(args.city ? { city: args.city } : {}),
    items: offers.slice(0, MAX_ITEMS).map(offerToItem),
    retrievedAt: now.toISOString(), sample: true, label: SAMPLE_LABEL,
  };
}

// ------------------------------------------------------------------ entry

const inflight = new Map<string, Promise<ResearchResult>>();

export async function runResearch(args: ResearchArgs, deps: ResearchDeps): Promise<ResearchResult> {
  const now = deps.now?.() ?? new Date();
  const key = cacheKey(args);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return { ...hit.result, query: args.query, cached: true };

  const apiKey = deps.apiKey?.trim();
  if (!apiKey) {
    deps.onFallback?.('no key');
    return sampleFallback(args, now);
  }
  // Concurrent requests for the same key (e.g. the warm-up and a user turn) share one search.
  const running = inflight.get(key);
  if (running) return running.then((r) => ({ ...r, query: args.query }));
  const p = live(args, { ...deps, apiKey }, key, now).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function live(args: ResearchArgs, d: D, key: string, now: Date): Promise<ResearchResult> {
  try {
    const { items, model } = await hedged(args, d, d.model ?? RESEARCH_MODEL, d.hedgeAfterMs ?? HEDGE_AFTER_MS);
    const id = refId();
    const result: ResearchResult = {
      topic: args.topic, query: args.query, ...(args.city ? { city: args.city } : {}),
      items: items.map((it, i) => ({ ref: `${id}-${i}`, ...it })),
      retrievedAt: now.toISOString(), sample: false, label: RESEARCH_LABEL, model,
    };
    cache.set(key, { at: now.getTime(), result });
    return result;
  } catch (e) {
    d.trace?.('error', { message: e instanceof Error ? e.message : String(e) });
    d.onFallback?.(e instanceof Error ? e.message : 'unknown');
    // A previous live result (with its original retrievedAt) beats samples, even past the TTL.
    const stale = cache.get(key);
    if (stale) return { ...stale.result, query: args.query, cached: true };
    return sampleFallback(args, now);
  }
}

/** Compact form returned to the chat model (no URLs, to save tokens; the card carries them). */
export function researchForModel(r: ResearchResult) {
  return {
    live: !r.sample,
    note: r.sample ? 'Live search unavailable; these are curated SAMPLE offers. Say so.' : 'Live search results; tell the user to check with the provider.',
    retrievedAt: r.retrievedAt,
    items: r.items.map((i) => ({ ref: i.ref, provider: i.provider, product: i.product, headline: i.headline, ratePercent: i.ratePercent, percentOff: i.percentOff, conditions: i.conditions, source: i.sourceTitle })),
  };
}
