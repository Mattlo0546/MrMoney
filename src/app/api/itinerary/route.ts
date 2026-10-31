import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fallbackCatalog } from '@/lib/itinerary/fallback';
import { buildCatalog } from '@/lib/itinerary/research';
import { DEFAULT_PREFS, type CatalogResponse, type ItineraryPrefs } from '@/lib/itinerary/types';

// NOTE: no `runtime` / `dynamic` exports: next.config has cacheComponents, which rejects them (Node.js is the default
// runtime). The live build has a ~23s internal deadline, so allow headroom.
export const maxDuration = 40;

const MAX_BODY_CHARS = 20_000;
const text = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, len: number) => z.array(z.string().trim().max(len)).max(max).transform((xs) => xs.filter(Boolean));

const PrefsSchema = z.object({
  city: z.literal('London').catch('London').default('London'),
  cuisines: list(10, 40).default(DEFAULT_PREFS.cuisines),
  diet: z.string().trim().max(60).optional().catch(undefined),
  lines: list(13, 40).default(DEFAULT_PREFS.lines),
  homeStation: text(80).default(DEFAULT_PREFS.homeStation),
  campusStation: text(80).default(DEFAULT_PREFS.campusStation),
  commuteDays: z.array(z.number().int().min(0).max(6)).max(7).default(DEFAULT_PREFS.commuteDays),
  wants: list(10, 120).default(DEFAULT_PREFS.wants),
  treatsPerWeek: z.number().int().min(0).max(3).default(DEFAULT_PREFS.treatsPerWeek),
});
const CatalogRequestSchema = z.object({
  prefs: PrefsSchema.default(PrefsSchema.parse({})),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function POST(req: Request) {
  let json: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    json = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = CatalogRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const prefs: ItineraryPrefs = parsed.data.prefs;
  const today = parsed.data.today ?? londonToday();
  let catalog;
  try {
    catalog = await buildCatalog({ prefs, today }, { apiKey: process.env.GEMINI_API_KEY, today });
  } catch {
    catalog = fallbackCatalog(prefs, today);
  }
  return NextResponse.json({ catalog } satisfies CatalogResponse);
}
