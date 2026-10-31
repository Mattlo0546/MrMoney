/**
 * Live smoke test for the itinerary catalogue (real Gemini + Google Search). Run:
 *   pnpm dlx tsx --env-file=.env.local src/lib/itinerary/smoke.ts
 * Never prints the key.
 */
import { buildCatalog } from './research';
import { DEFAULT_PREFS, type ItineraryPrefs } from './types';

const prefs: ItineraryPrefs = {
  ...DEFAULT_PREFS,
  cuisines: ['Chinese', 'Italian'],
  lines: ['Circle line', 'District line'],
  homeStation: "King's Cross St. Pancras",
  campusStation: 'South Kensington',
  wants: ['new trainers'],
};

async function main() {
  const t0 = Date.now();
  const verbose = process.argv.includes('-v');
  const c = await buildCatalog({ prefs, today: '2026-10-31' }, {
    apiKey: process.env.GEMINI_API_KEY, today: '2026-10-31',
    trace: (e, d) => console.log(`  · ${e} +${Date.now() - t0}ms`, verbose ? JSON.stringify(d) : JSON.stringify(d).slice(0, 300)),
  });
  const ms = Date.now() - t0;
  const products = Object.values(c.products);
  const live = products.filter((p) => p.origin === 'research');
  console.log(`\nlive=${c.live} in ${ms}ms · products ${products.length} (research ${live.length}, medium ${live.filter((p) => p.confidence === 'medium').length}) · recipes ${c.recipes.length} (live ${c.recipes.filter((r) => r.id.startsWith('live-')).length}) · fares ${c.fares.length} (research ${c.fares.filter((f) => f.origin === 'research').length}) · wants ${c.wants.length}`);
  console.log('sources:', c.sources);
  console.log('\nresearch products:');
  for (const p of live.slice(0, 25)) console.log(`  £${(p.pricePence / 100).toFixed(2)}  ${p.name} [${p.packSize ?? ''}] @ ${p.merchant} (${p.confidence}, ${p.domain}) ${p.url.slice(0, 110)}`);
  console.log('\nlive recipes:');
  for (const r of c.recipes.filter((x) => x.id.startsWith('live-'))) console.log(`  ${r.name} (${r.cuisine}, ${r.meal}, ${r.tier}) — ${r.ingredients.map((i) => `${c.products[i.productId].name.slice(0, 30)} ×${i.portion}`).join('; ')} | eq: ${r.equipment.join(',')}`);
  console.log('\nfares:');
  for (const f of c.fares.filter((x) => prefs.lines.includes(x.line) || x.line === 'Bus')) console.log(`  ${f.line}: peak ${f.peakPence} off ${f.offPeakPence} cap ${f.dailyCapPence} ${f.zones} (${f.origin}) ${f.url.slice(0, 100)}`);
  console.log('\nwants:');
  for (const w of c.wants) { const p = c.products[w.productId]; console.log(`  ${w.label} -> ${p.name} £${(p.pricePence / 100).toFixed(2)} @ ${p.merchant} (${p.origin}/${p.confidence ?? '-'}) ${p.url.slice(0, 100)}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
