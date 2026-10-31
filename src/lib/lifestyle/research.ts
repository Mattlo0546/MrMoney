/**
 * Server: finds the food prices a lifestyle needs (Google Search–grounded, cited) and the best easy-access savings
 * account (the shared research tool), in parallel under one deadline. Never throws: anything missing falls back to
 * the curated prices; the savings account is simply left out when live search finds none.
 */
import { z } from 'zod';
import { generateContent, visibleText } from '@/lib/agent/gemini';
import { annotateCitations, EXTRACT_MODEL, RESEARCH_MODEL, runResearch, THINKING, type ResearchDeps } from '@/lib/agent/research';
import { chunkSource, supportedNumbers } from '@/lib/itinerary/research';
import type { ResearchResult } from '@/lib/agent/types';
import { FALLBACK_DEALS } from './fallback';
import { DEAL_KINDS, type DealKind, type FoodDeal, type Lifestyle, type LifestyleMenu, type SavingsPick } from './types';

export const MENU_DEADLINE_MS = 20_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PRICE_RANGE: Record<DealKind, [number, number]> = {
  meal_deal: [200, 800], cheap_dinner: [50, 600], coffee: [80, 600], lunch_out: [300, 2000], takeaway: [500, 3500], dinner_out: [800, 6000],
};

const QUERIES: Record<'cheap' | 'out', string> = {
  cheap: 'Current UK supermarket meal deal prices (Tesco, Sainsbury\'s, Boots, Co-op, Morrisons, Asda, Waitrose), including loyalty card prices, and the cheapest student home-cooked dinner per portion from Aldi or Lidl. Give each price in £ with the retailer.',
  out: 'Current UK prices: supermarket meal deals (Tesco, Sainsbury\'s, Boots, Co-op) with loyalty prices, a regular coffee at Greggs or Costa, a Pret lunch (wrap or sandwich and a drink), a Nando\'s quarter chicken meal, and a wagamama main. Give each price in £ with the brand.',
};

export interface MenuDeps extends ResearchDeps {
  deadlineMs?: number;
  /** Overrides (tests). */
  research?: typeof runResearch;
}

const cache = new Map<string, { at: number; menu: LifestyleMenu }>();
export function clearMenuCache() { cache.clear(); }

const ExtractSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: [...DEAL_KINDS] },
          merchant: { type: 'STRING' },
          name: { type: 'STRING' },
          priceGbp: { type: 'NUMBER' },
          condition: { type: 'STRING', nullable: true },
          sourceIndex: { type: 'INTEGER', nullable: true },
        },
        required: ['kind', 'merchant', 'name', 'priceGbp'],
      },
    },
  },
  required: ['items'],
};

const Extracted = z.object({
  items: z.array(z.object({
    kind: z.enum(DEAL_KINDS), merchant: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(80),
    priceGbp: z.number(), condition: z.string().trim().max(80).nullish(), sourceIndex: z.number().int().nullish(),
  }).catch(null as never)).catch([]),
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function searchDeals(which: 'cheap' | 'out', d: MenuDeps & { apiKey: string }, signal: AbortSignal): Promise<FoodDeal[]> {
  const res = await generateContent({
    apiKey: d.apiKey, model: RESEARCH_MODEL, fetchImpl: d.fetchImpl, timeoutMs: (d.deadlineMs ?? MENU_DEADLINE_MS) - 6000, signal,
    body: {
      systemInstruction: { parts: [{ text: `Today is ${d.today}. You find current UK food prices for a student budget. Quote prices exactly as the sources state them.` }] },
      contents: [{ role: 'user', parts: [{ text: QUERIES[which] }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 2000, ...(THINKING[RESEARCH_MODEL] ? { thinkingConfig: { thinkingLevel: THINKING[RESEARCH_MODEL] } } : {}) },
    },
  });
  const cand = res.candidates?.[0];
  const text = visibleText(cand?.content?.parts);
  const gm = cand?.groundingMetadata;
  if (!text || !gm?.groundingChunks?.length) throw new Error('No grounded answer');
  const sources = gm.groundingChunks.map((c, i) => `[${i + 1}] ${c.web?.title ?? 'source'}`).join('\n');
  const ex = await generateContent({
    apiKey: d.apiKey, model: EXTRACT_MODEL, fetchImpl: d.fetchImpl, timeoutMs: 6000, signal,
    body: {
      systemInstruction: { parts: [{ text: `Extract food prices. kind: meal_deal (supermarket main+snack+drink), cheap_dinner (home-cooked portion), coffee, lunch_out, takeaway, dinner_out. Copy names and prices exactly; never invent or compute. sourceIndex is the [n] cited next to the price, or null.` }] },
      contents: [{ role: 'user', parts: [{ text: `TEXT:\n${annotateCitations(text, gm)}\n\nSOURCES:\n${sources}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ExtractSchema, maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: 'minimal' } },
    },
  });
  const parsed = Extracted.parse(JSON.parse(visibleText(ex.candidates?.[0]?.content?.parts) || '{}'));
  const support = supportedNumbers(text, gm);
  const out: FoodDeal[] = [];
  for (const it of parsed.items) {
    if (!it) continue;
    const pence = Math.round(it.priceGbp * 100);
    const [lo, hi] = PRICE_RANGE[it.kind];
    if (!Number.isInteger(pence) || pence < lo || pence > hi) continue;
    const src = chunkSource(gm, it.sourceIndex);
    // Only prices a cited source actually supports count as research.
    if (!src || !support.get(it.sourceIndex!)?.has(it.priceGbp)) continue;
    out.push({
      id: `live-${slug(`${it.merchant}-${it.name}`)}-${pence}`, kind: it.kind, merchant: it.merchant, ...(src.domain !== 'source' ? { domain: src.domain } : {}),
      name: it.name, pricePence: pence, ...(it.condition ? { condition: it.condition } : {}),
      url: src.url, sourceTitle: src.title, checked: d.today, origin: 'research', confidence: 'medium',
    });
  }
  return out;
}

function bestSavings(r: ResearchResult | null): SavingsPick | undefined {
  if (!r || r.sample) return undefined;
  const top = r.items.filter((i) => typeof i.ratePercent === 'number' && i.ratePercent > 0 && i.ratePercent <= 25).sort((a, b) => b.ratePercent! - a.ratePercent!)[0];
  return top ? { ref: top.ref, provider: top.provider, product: top.product, ratePercent: top.ratePercent!, headline: top.headline.slice(0, 160), sourceUrl: top.sourceUrl } : undefined;
}

const withDeadline = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** Returns the menu plus the raw savings research (for its cited card). */
export async function findLifestyleMenu(lifestyle: Lifestyle, deps: MenuDeps): Promise<{ menu: LifestyleMenu; savingsResearch: ResearchResult | null }> {
  const which = lifestyle === 'brokie' || lifestyle === 'balanced' ? 'cheap' : 'out';
  const key = `${which}:${deps.today}`;
  const now = deps.now?.().getTime() ?? Date.now();
  const deadline = deps.deadlineMs ?? MENU_DEADLINE_MS;
  const apiKey = deps.apiKey?.trim();
  const ctl = new AbortController();
  const hit = cache.get(key);
  const dealsP = hit && now - hit.at < CACHE_TTL_MS
    ? Promise.resolve(hit.menu.deals.filter((x) => x.origin === 'research'))
    : apiKey ? withDeadline(searchDeals(which, { ...deps, apiKey }, ctl.signal), deadline, [] as FoodDeal[]) : Promise.resolve([] as FoodDeal[]);
  const savingsP = withDeadline(
    (deps.research ?? runResearch)({ topic: 'savings_rates', query: 'best easy access savings account UK' }, deps),
    deadline, null as ResearchResult | null,
  );
  const [live, savingsResearch] = await Promise.all([dealsP, savingsP]);
  ctl.abort();
  const liveKinds = new Set(live.map((x) => x.kind));
  const deals = [...live, ...FALLBACK_DEALS.filter((x) => !liveKinds.has(x.kind))].slice(0, 40);
  const savings = bestSavings(savingsResearch);
  const menu: LifestyleMenu = { deals, ...(savings ? { savings } : {}), live: live.length > 0 };
  if (live.length) cache.set(key, { at: now, menu });
  return { menu, savingsResearch };
}
