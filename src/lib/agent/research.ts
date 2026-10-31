/**
 * `research` server tool: (1) a Google Search–grounded call, (2) a cheap structured-extraction call that turns the
 * grounded text + groundingChunks into items. Every item must cite a grounding chunk URL or it is dropped.
 * Cached in memory for 6h per (topic, city) (topic 'other' also keys on the query). Falls back to the curated
 * sample catalogue (`sample: true`) on any failure.
 */
import { z } from 'zod';
import { CuratedOfferSource, type Offer, type OfferCategory } from '@/lib/offers';
import { generateContent, visibleText, type GroundingMetadata } from './gemini';
import { RESEARCH_LABEL, SAMPLE_LABEL, type ResearchArgs, type ResearchItem, type ResearchResult, type ResearchTopic } from './types';

/**
 * Benchmark 2026-10-31 (2 runs x 2 queries: "best UK easy-access savings rates today", "UK student discounts on food in London"; google_search grounding):
 *   gemini-4-argon   mean 15.8s (12.2–22.0)  best quality: top rate (Cahoot 5.00%), detailed conditions, on-topic
 *   gemini-3.5-flash mean 16.4s (10.8–22.5)  good, but drifted into cash ISAs for an easy-access query
 *   gemini-3.8-flash mean 20.5s (16.9–25.7)  good quality, slowest
 * Live smoke runs later showed argon tails of 24–25s+, so the search is HEDGED: argon starts first; if it has not
 * answered after HEDGE_AFTER_MS (or fails), gemini-3.5-flash starts in parallel and the first grounded answer wins.
 * Both share a hard deadline of RESEARCH_DEADLINE_MS, keeping research within the ~30s budget (R-chat-ux).
 */
export const RESEARCH_MODEL = 'gemini-4-argon';
export const RESEARCH_FALLBACK_MODEL = 'gemini-3.5-flash';
export const EXTRACT_MODEL = 'gemini-3.5-flash-lite';
export const HEDGE_AFTER_MS = 12_000;
export const RESEARCH_DEADLINE_MS = 26_000;
export const EXTRACT_TIMEOUT_MS = 6_000;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ITEMS = 6;

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
}

// ------------------------------------------------------------------ cache

const cache = new Map<string, { at: number; result: ResearchResult }>();
export function clearResearchCache() {
  cache.clear();
}
export function cacheKey(a: ResearchArgs): string {
  const city = (a.city ?? '').trim().toLowerCase();
  return a.topic === 'other' ? `${a.topic}|${city}|${a.query.trim().toLowerCase()}` : `${a.topic}|${city}`;
}

// ------------------------------------------------------------------ extraction

const ExtractedSchema = z.object({
  items: z.array(
    z.object({
      provider: z.string().min(1).max(80),
      product: z.string().min(1).max(120),
      headline: z.string().min(1).max(120),
      ratePercent: z.number().min(0).max(100).nullish(),
      percentOff: z.number().min(0).max(100).nullish(),
      conditions: z.array(z.string().max(200)).max(5).default([]),
      sourceIndex: z.number().int().nullish(),
    }),
  ),
});

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
          conditions: { type: 'ARRAY', items: { type: 'STRING' } },
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

/** Maps extracted items onto grounding chunks; drops any without a valid chunk URL, and rates not present in the grounded text. */
export function citeItems(extracted: z.infer<typeof ExtractedSchema>['items'], gm: GroundingMetadata | undefined, groundedText: string): Omit<ResearchItem, 'ref'>[] {
  const chunks = gm?.groundingChunks ?? [];
  const out: Omit<ResearchItem, 'ref'>[] = [];
  for (const it of extracted) {
    if (it.sourceIndex == null) continue;
    const chunk = chunks[it.sourceIndex - 1];
    const uri = chunk?.web?.uri;
    if (!uri || !/^https?:\/\//.test(uri)) continue;
    const appears = (n: number | null | undefined) => n != null && groundedText.includes(String(n));
    out.push({
      provider: it.provider.trim(),
      product: it.product.trim(),
      headline: it.headline.trim(),
      ...(appears(it.ratePercent) ? { ratePercent: it.ratePercent! } : {}),
      ...(appears(it.percentOff) ? { percentOff: it.percentOff! } : {}),
      conditions: it.conditions.map((c) => c.trim()).filter(Boolean).slice(0, 4),
      sourceUrl: uri,
      sourceTitle: chunk?.web?.title?.trim() || new URL(uri).hostname,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// ------------------------------------------------------------------ live search

async function groundedSearch(args: ResearchArgs, deps: ResearchDeps & { apiKey: string }, model: string, timeoutMs: number) {
  const sys = [
    `You research current UK personal-finance facts for a student budgeting app. Today is ${deps.today}. Use Google Search.`,
    `Focus: ${TOPIC_HINT[args.topic]}`,
    'List up to 6 concrete current options as short bullet lines with the exact figure from the source. Only include facts found in search results. GBP only. Never recommend specific stocks or funds.',
  ].join('\n');
  const q = args.city ? `${args.query} (city: ${args.city}, UK)` : `${args.query} (UK)`;
  const res = await generateContent({
    apiKey: deps.apiKey, model, fetchImpl: deps.fetchImpl, timeoutMs,
    body: { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: q }] }], tools: [{ google_search: {} }] },
  });
  const cand = res.candidates?.[0];
  const text = visibleText(cand?.content?.parts);
  const gm = cand?.groundingMetadata;
  if (!text || !gm?.groundingChunks?.length) throw new Error('No grounded answer');
  return { text, gm };
}

async function extract(text: string, gm: GroundingMetadata, deps: ResearchDeps & { apiKey: string }) {
  const sources = (gm.groundingChunks ?? []).map((c, i) => `[${i + 1}] ${c.web?.title ?? 'source'}`).join('\n');
  const res = await generateContent({
    apiKey: deps.apiKey, model: EXTRACT_MODEL, fetchImpl: deps.fetchImpl, timeoutMs: EXTRACT_TIMEOUT_MS,
    body: {
      systemInstruction: { parts: [{ text: 'Extract structured items from the grounded research text. Copy figures exactly; never invent or compute. Each item must name the [n] source number cited next to it in the text; if none is cited, use null.' }] },
      contents: [{ role: 'user', parts: [{ text: `TEXT:\n${annotateCitations(text, gm)}\n\nSOURCES:\n${sources}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: extractResponseSchema, maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: 'minimal' } },
    },
  });
  const raw = visibleText(res.candidates?.[0]?.content?.parts);
  return ExtractedSchema.parse(JSON.parse(raw)).items;
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

// ------------------------------------------------------------------ hedging

type Grounded = Awaited<ReturnType<typeof groundedSearch>> & { model: string };

/** Primary first; the fallback model starts after `hedgeAfterMs` or as soon as the primary fails. First success wins. */
function hedgedSearch(args: ResearchArgs, d: ResearchDeps & { apiKey: string }, primary: string, hedgeAfterMs: number): Promise<Grounded> {
  const started = Date.now();
  const run = (model: string) => groundedSearch(args, d, model, Math.max(1000, RESEARCH_DEADLINE_MS - (Date.now() - started))).then((g) => ({ ...g, model }));
  if (primary === RESEARCH_FALLBACK_MODEL) return run(primary);
  return new Promise<Grounded>((resolve, reject) => {
    let failures = 0;
    let hedged = false;
    const fail = (e: unknown) => {
      failures++;
      if (failures === 2) reject(e);
      else startHedge();
    };
    const win = (g: Grounded) => {
      clearTimeout(timer);
      resolve(g);
    };
    function startHedge() {
      if (hedged) return;
      hedged = true;
      clearTimeout(timer);
      run(RESEARCH_FALLBACK_MODEL).then(win, fail);
    }
    // Callbacks run asynchronously, so `timer` is initialised before startHedge/win can read it.
    const timer = setTimeout(startHedge, hedgeAfterMs);
    run(primary).then(win, fail);
  });
}

// ------------------------------------------------------------------ entry

export async function runResearch(args: ResearchArgs, deps: ResearchDeps): Promise<ResearchResult> {
  const now = deps.now?.() ?? new Date();
  const key = cacheKey(args);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return { ...hit.result, cached: true };

  const apiKey = deps.apiKey?.trim();
  if (!apiKey) {
    deps.onFallback?.('no key');
    return sampleFallback(args, now);
  }
  const d = { ...deps, apiKey };
  const primary = deps.model ?? RESEARCH_MODEL;
  try {
    const { model, ...g } = await hedgedSearch(args, d, primary, deps.hedgeAfterMs ?? HEDGE_AFTER_MS);
    const items = citeItems(await extract(g.text, g.gm, d), g.gm, g.text);
    if (!items.length) throw new Error('No cited items');
    const id = refId();
    const result: ResearchResult = {
      topic: args.topic, query: args.query, ...(args.city ? { city: args.city } : {}),
      items: items.map((it, i) => ({ ref: `${id}-${i}`, ...it })),
      retrievedAt: now.toISOString(), sample: false, label: RESEARCH_LABEL, model,
    };
    cache.set(key, { at: now.getTime(), result });
    return result;
  } catch (e) {
    deps.onFallback?.(e instanceof Error ? e.message : 'unknown');
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
