/**
 * Creative spending plan scheduler. Pure and deterministic: the same ScheduleInput always yields the same
 * ScheduleResult. Money is integer pence; every purchase is itemised (Σ lines = amount) and every line points at
 * a real product or TfL fare with a source URL.
 *
 * How it works:
 *  1. Pick a dinner per day (variety, liked/disliked, preferred cuisines, Fri/Sat treats, payday treat,
 *     lean days before income), simulating a real kitchen: whole packs are bought when something runs out,
 *     leftovers are used for free, fresh food expires, staples last, equipment is bought once.
 *  2. Commute days get TfL journeys on the student's lines (peak out, peak/off-peak back, capped).
 *  3. Wants are placed on sensible days (payday, weekends for eating out) respecting cash caps.
 *  4. A ladder of plan "levels" (richest → leanest) is tried; the richest that fits the budget and caps wins.
 */
import type { ISODate, PlannedPurchase, PurchaseLine } from '@/lib/engine';
import { formatMoney, gbp } from '@/lib/engine';
import { dateRange, dayOfWeek, formatShortDate, toOrdinal } from '@/lib/engine/dates';
import { buildQuestions } from './questions';
import type {
  Catalog,
  CatalogProduct,
  CategoryMap,
  Recipe,
  ScheduleInput,
  ScheduleResult,
  TransportFare,
  WantItem,
} from './types';
import { fareRef, refFor } from './types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Fresh food is usable for this many days after purchase (inclusive of purchase day). */
const FRESH_DAYS = 5;
const EPS = 1e-6;
/** Upgrades are only taken if at least this share of the budget stays unspent as a buffer. */
const UPGRADE_BUFFER = 0.1;

type Tier = Recipe['tier'];

// ---------- categories ----------

export function resolveCategories(profileCategories: { id: string; name: string }[]): CategoryMap {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const find = (keys: string[], fallback: string): string => {
    for (const k of keys) {
      const hit = profileCategories.find((c) => norm(c.id) === k || norm(c.name) === k);
      if (hit) return hit.id;
    }
    for (const k of keys) {
      const hit = profileCategories.find((c) => norm(c.id).includes(k) || norm(c.name).includes(k));
      if (hit) return hit.id;
    }
    return fallback;
  };
  return {
    groceries: find(['groceries', 'grocery', 'food'], 'groceries'),
    transport: find(['transport', 'travel', 'commute'], 'transport'),
    eatingOut: find(['eatingout', 'takeaway', 'takeaways', 'dining', 'restaurants'], 'eating-out'),
    shopping: find(['shopping', 'fun', 'leisure', 'personal'], 'shopping'),
  };
}

// ---------- PRNG ----------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- plan levels ----------

interface Level {
  treatsPerWeek: number;
  payday: boolean;
  /** Treat days use treat-tier recipes; false = downgraded to standard. */
  treatTier: boolean;
  normal: 'mixed' | 'budget';
  /** Two days before each income date are budget dinners. */
  lean: boolean;
  lunches: boolean;
  trips: boolean;
  dropWants: string[];
}

interface Build {
  purchases: PlannedPurchase[];
  total: number;
  notes: string[];
  treatDays: number;
  tripDays: number;
  leftoverMeals: number;
  placedWants: string[];
}

const weekIndex = (d: ISODate) => Math.floor((toOrdinal(d) + 3) / 7); // Monday-start weeks

function matchesLine(fareLine: string, pref: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\bline\b/g, '').replace(/[^a-z&]/g, '');
  return n(fareLine) === n(pref);
}

function usedFares(catalog: Catalog, lines: string[]): { fares: TransportFare[]; fallback: boolean } {
  const out: TransportFare[] = [];
  for (const l of lines) {
    const f = catalog.fares.find((x) => matchesLine(x.line, l));
    if (f && !out.includes(f)) out.push(f);
  }
  if (out.length) return { fares: out, fallback: false };
  return { fares: catalog.fares.slice(0, 1), fallback: catalog.fares.length > 0 };
}

interface StockEntry {
  remaining: number;
  /** Ordinal day the current pack was bought. */
  bought: number;
  boughtLabel: string;
}

function buildPlan(input: ScheduleInput, level: Level, skip: Set<ISODate>): Build {
  const { catalog, prefs, answers, categories } = input;
  const seed = input.seed ?? hashString(input.start);
  const rng = mulberry32(seed);
  const days = dateRange(input.start, input.end);
  const incomes = (input.incomeDates ?? []).filter((d) => d >= input.start && d <= input.end).sort();
  const allIncomes = (input.incomeDates ?? []).slice().sort();
  const notes: string[] = [];
  const disliked = new Set(answers.disliked);
  const liked = new Set(answers.liked);
  const owned = answers.owned ?? {};
  const prefCuisines = new Set(prefs.cuisines.map((c) => c.toLowerCase()));
  const product = (id: string): CatalogProduct | undefined => catalog.products[id];
  const usable = (rc: Recipe) =>
    !disliked.has(rc.id) && rc.ingredients.every((i) => product(i.productId)) && rc.equipment.every((e) => product(e));
  const dinners = catalog.recipes.filter((rc) => rc.meal === 'dinner' && usable(rc));
  const lunches = catalog.recipes.filter((rc) => rc.meal === 'lunch' && usable(rc));

  // ----- day tiers -----
  const tierOf = new Map<ISODate, { tier: Tier; reason: string }>();
  const treatOrder = [5, 6, 0, 4];
  const byWeek = new Map<number, ISODate[]>();
  for (const d of days) {
    const w = weekIndex(d);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(d);
  }
  let treatDays = 0;
  const treatTier: Tier = level.treatTier ? 'treat' : 'standard';
  for (const wdays of byWeek.values()) {
    let n = 0;
    for (const dow of treatOrder) {
      if (n >= level.treatsPerWeek) break;
      const d = wdays.find((x) => dayOfWeek(x) === dow);
      if (d) {
        tierOf.set(d, { tier: treatTier, reason: `${WEEKDAYS[dow]} treat` });
        n++;
        treatDays++;
      }
    }
  }
  if (level.payday) {
    for (const inc of incomes) {
      if (!tierOf.has(inc)) treatDays++;
      tierOf.set(inc, { tier: treatTier, reason: 'payday treat' });
    }
  }
  if (level.lean) {
    for (const inc of allIncomes) {
      for (const back of [1, 2]) {
        const d = days.find((x) => toOrdinal(x) === toOrdinal(inc) - back);
        if (d && !tierOf.has(d)) tierOf.set(d, { tier: 'budget', reason: 'lean day before payday' });
      }
    }
  }

  // ----- kitchen simulation -----
  const stock = new Map<string, StockEntry>();
  const equipmentHave = new Set<string>();
  const purchases: PlannedPurchase[] = [];
  const history: Recipe[] = [];
  const lastDinner = (): Recipe | undefined => [...history].reverse().find((h) => h.meal === 'dinner');
  let leftoverMeals = 0;
  let freeDays = 0;

  const inStock = (pid: string, portion: number, today: number): StockEntry | null => {
    const e = stock.get(pid);
    if (!e) return null;
    const p = product(pid)!;
    if (p.kind === 'fresh' && today - e.bought >= FRESH_DAYS) return null;
    return e.remaining + EPS >= portion ? e : null;
  };

  const pickRecipe = (pool: Recipe[], tier: Tier, today: number, avoid?: Recipe): Recipe | null => {
    const fallbacks: Record<Tier, Tier[]> = {
      treat: ['treat', 'standard', 'budget'],
      standard: ['standard', 'budget', 'treat'],
      budget: ['budget', 'standard', 'treat'],
    };
    let cands: Recipe[] = [];
    for (const t of fallbacks[tier]) {
      cands = pool.filter((rc) => rc.tier === t);
      if (cands.length) break;
    }
    if (!cands.length) return null;
    const prev = avoid;
    const notPrev = cands.filter((rc) => rc !== prev);
    if (notPrev.length) cands = notPrev;
    const recent = history.slice(-4);
    const weights = cands.map((rc) => {
      let w = 1;
      if (liked.has(rc.id)) w *= 3;
      if (prefCuisines.has(rc.cuisine.toLowerCase())) w *= 1.6;
      if (prev && prev.cuisine === rc.cuisine) w *= 0.4;
      if (recent.includes(rc)) w *= 0.2;
      const freshHits = rc.ingredients.filter((i) => product(i.productId)!.kind === 'fresh' && inStock(i.productId, i.portion, today)).length;
      w *= 1 + 0.6 * freshHits;
      // When cash is tight, avoid recipes that need new kit.
      if (level.normal === 'budget') w *= 0.1 ** rc.equipment.filter((e) => !equipmentHave.has(e)).length;
      return w;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let x = rng() * sum;
    for (let i = 0; i < cands.length; i++) {
      x -= weights[i];
      if (x <= 0) return cands[i];
    }
    return cands[cands.length - 1];
  };

  const cook = (rc: Recipe, d: ISODate, today: number, lines: PurchaseLine[]): number => {
    let leftovers = 0;
    const label = `${WD[dayOfWeek(d)]} ${rc.name.toLowerCase()}`;
    for (const eq of rc.equipment) {
      if (equipmentHave.has(eq)) continue;
      equipmentHave.add(eq);
      const p = product(eq)!;
      const own = owned[eq];
      lines.push({
        name: p.name,
        qty: p.packSize ? `1 x ${p.packSize}` : '1',
        pence: own ? 0 : p.pricePence,
        ref: refFor(p),
        note: own ? 'already in your cupboard' : `for ${rc.name} — yours to keep`,
      });
    }
    for (const ing of rc.ingredients) {
      const p = product(ing.productId)!;
      const own = !!owned[ing.productId];
      const have = inStock(ing.productId, ing.portion, today);
      if (have) {
        const note = own ? 'already in your cupboard' : leftoverNoteFor(have, today);
        have.remaining -= ing.portion;
        lines.push({ name: p.name, qty: ing.qty, pence: 0, ref: refFor(p), note });
        if (!own) leftovers++;
      } else {
        // Buy a whole pack (what's left of an old pack is binned if expired, topped up otherwise).
        const old = stock.get(ing.productId);
        const carried = old && !(p.kind === 'fresh' && today - old.bought >= FRESH_DAYS) ? old.remaining : 0;
        stock.set(ing.productId, { remaining: carried + 1 - ing.portion, bought: today, boughtLabel: label });
        lines.push({
          name: p.name,
          qty: own ? ing.qty : p.packSize ? `1 x ${p.packSize}` : '1 pack',
          pence: own ? 0 : p.pricePence,
          ref: refFor(p),
          note: own ? 'already in your cupboard' : `for ${rc.name} (${ing.qty})`,
        });
      }
    }
    history.push(rc);
    return leftovers;
  };

  const leftoverNoteFor = (e: StockEntry, today: number): string => {
    if (today - e.bought <= 6) return `left over from ${e.boughtLabel}`;
    return `left over from your ${formatShortDate(dateFromOrd(e.bought, days))} shop`;
  };

  if (!dinners.length) notes.push('No dinner recipes left to schedule — tell me what you like and I will find more.');

  let commuteIdx = 0;
  const { fares, fallback: fareFallback } = usedFares(catalog, prefs.lines);
  if (fareFallback) notes.push(`No fares found for ${prefs.lines.join(', ')} — using ${fares[0].line} prices.`);
  const commute = new Set(prefs.commuteDays);
  let tripDays = 0;
  const skippedDays: ISODate[] = [];

  for (const d of days) {
    const today = toOrdinal(d);
    const dow = dayOfWeek(d);
    if (skip.has(d)) {
      skippedDays.push(d);
      continue;
    }
    // Meals
    const dayTier = tierOf.get(d) ?? {
      tier: level.normal === 'budget' ? ('budget' as Tier) : rng() < 0.55 ? ('standard' as Tier) : ('budget' as Tier),
      reason: '',
    };
    const lines: PurchaseLine[] = [];
    const parts: string[] = [];
    let lo = 0;
    const lunch = level.lunches && commute.has(dow) && lunches.length ? pickRecipe(lunches, 'budget', today) : null;
    const dinner = dinners.length ? pickRecipe(dinners, dayTier.tier, today, lastDinner()) : null;
    if (dinner) {
      lo += cook(dinner, d, today, lines);
      parts.push(`Dinner: ${dinner.name}`);
    }
    if (lunch) {
      lo += cook(lunch, d, today, lines);
      parts.push(`Packed lunch: ${lunch.name}`);
    }
    const amount = lines.reduce((s, l) => s + l.pence, 0);
    if (lo > 0) leftoverMeals++;
    if (amount === 0 && lines.length) freeDays++;
    if (lines.length) {
      const main = lines.reduce((a, b) => (b.pence > a.pence ? b : a), lines[0]);
      const paid = lines.filter((l) => l.pence > 0).length;
      let reason = dayTier.reason;
      if (amount === 0) {
        reason = dayTier.reason ? `${dayTier.reason} (uses leftovers — £0 day)` : 'uses leftovers — £0 day';
      } else if (!reason) {
        reason = lines.length - paid > paid ? 'uses leftovers — cheap day' : dinner?.tier === 'budget' ? 'budget dinner' : 'everyday cooking';
      } else if (lines.length - paid > paid) reason += ' (uses leftovers)';
      purchases.push({
        id: `itin-${d}-groceries`,
        date: d,
        category: categories.groceries,
        amount: gbp(amount),
        label: parts.join(' · '),
        ref: main.ref,
        lines,
        source: 'itinerary',
        reason,
      });
    }

    // Transport
    if (fares.length && commute.has(dow)) {
      const out = fares[commuteIdx % fares.length];
      const back = fares[(commuteIdx + 1) % fares.length];
      commuteIdx++;
      const backOffPeak = dow === 5;
      const tl: PurchaseLine[] = [
        { name: `${out.line}: ${out.from} → ${out.to}`, qty: '1 journey', pence: out.peakPence, ref: fareRef(out, out.peakPence), note: 'peak fare (morning)' },
        {
          name: `${back.line}: ${back.to} → ${back.from}`,
          qty: '1 journey',
          pence: backOffPeak ? back.offPeakPence : back.peakPence,
          ref: fareRef(back, backOffPeak ? back.offPeakPence : back.peakPence),
          note: backOffPeak ? 'off-peak fare (home before 4pm on Friday)' : 'peak fare (evening)',
        },
      ];
      capLines(tl, Math.min(out.dailyCapPence, back.dailyCapPence));
      const lineNames = [...new Set([out.line, back.line])].join(' + ');
      purchases.push({
        id: `itin-${d}-transport`,
        date: d,
        category: categories.transport,
        amount: gbp(tl.reduce((s, l) => s + l.pence, 0)),
        label: `Commute: ${out.from} ⇄ ${out.to}`,
        ref: tl[0].ref,
        lines: tl,
        source: 'itinerary',
        reason: `commute day (${lineNames})`,
      });
    } else if (fares.length && level.trips && dow === 6 && weekIndex(d) % 2 === 0) {
      const f = fares[0];
      const tl: PurchaseLine[] = [
        { name: `${f.line}: ${f.from} → ${f.to}`, qty: '1 journey', pence: f.offPeakPence, ref: fareRef(f, f.offPeakPence), note: 'off-peak fare' },
        { name: `${f.line}: ${f.to} → ${f.from}`, qty: '1 journey', pence: f.offPeakPence, ref: fareRef(f, f.offPeakPence), note: 'off-peak fare' },
      ];
      capLines(tl, f.dailyCapPence);
      tripDays++;
      purchases.push({
        id: `itin-${d}-transport`,
        date: d,
        category: categories.transport,
        amount: gbp(tl.reduce((s, l) => s + l.pence, 0)),
        label: `Weekend trip: ${f.from} ⇄ ${f.to}`,
        ref: tl[0].ref,
        lines: tl,
        source: 'itinerary',
        reason: 'weekend outing (off-peak)',
      });
    }
  }

  // ----- wants -----
  const placedWants: string[] = [];
  const dropped = new Set([...answers.droppedWants, ...level.dropWants]);
  const wantDays = new Set<ISODate>();
  for (const want of catalog.wants) {
    if (dropped.has(want.id)) continue;
    const p = product(want.productId);
    if (!p) continue;
    const placed = placeWant(input, want, p, days, incomes, purchases, wantDays);
    if (!placed) {
      notes.push(`${want.label} (${formatMoney(p.pricePence)}) can't be covered before money arrives — left for next period.`);
      continue;
    }
    wantDays.add(placed.date);
    placedWants.push(want.id);
    purchases.push({
      id: `itin-${placed.date}-want-${want.id}`,
      date: placed.date,
      category: want.bucket === 'eatingOut' ? categories.eatingOut : categories.shopping,
      amount: gbp(p.pricePence),
      label: want.label,
      ref: refFor(p),
      lines: [{ name: p.name, qty: p.packSize ?? '1', pence: p.pricePence, ref: refFor(p), note: placed.reason }],
      source: 'itinerary',
      reason: placed.reason,
    });
  }

  if (skippedDays.length) {
    notes.push(
      `Couldn't fit ${skippedDays.length} day${skippedDays.length === 1 ? '' : 's'} (${formatShortDate(skippedDays[0])}${
        skippedDays.length > 1 ? ` – ${formatShortDate(skippedDays[skippedDays.length - 1])}` : ''
      }) — answer the questions below or top up to cover them.`,
    );
  }

  if (freeDays) notes.push(`${freeDays} dinner${freeDays === 1 ? ' is' : 's are'} made entirely from leftovers — £0 days.`);

  purchases.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const total = purchases.reduce((s, x) => s + x.amount.pence, 0);
  return { purchases, total, notes, treatDays, tripDays, leftoverMeals, placedWants };
}

function dateFromOrd(ord: number, days: ISODate[]): ISODate {
  return days.find((d) => toOrdinal(d) === ord) ?? days[0];
}

/** Trim the last lines so the day's fares never exceed the PAYG daily cap. */
function capLines(lines: PurchaseLine[], cap: number) {
  let sum = lines.reduce((s, l) => s + l.pence, 0);
  if (sum <= cap) return;
  for (let i = lines.length - 1; i >= 0 && sum > cap; i--) {
    const cut = Math.min(lines[i].pence, sum - cap);
    lines[i] = { ...lines[i], pence: lines[i].pence - cut, note: 'daily cap reached', ref: { ...lines[i].ref, pricePence: lines[i].pence - cut } };
    sum -= cut;
  }
}

function cumulativeFits(input: ScheduleInput, purchases: PlannedPurchase[], date: ISODate, extra: number): boolean {
  for (const c of input.caps ?? []) {
    if (c.date < date) continue;
    const cum = purchases.filter((p) => p.date <= c.date).reduce((s, p) => s + p.amount.pence, 0);
    if (cum + extra > c.cap) return false;
  }
  return true;
}

function placeWant(
  input: ScheduleInput,
  want: WantItem,
  p: CatalogProduct,
  days: ISODate[],
  incomes: ISODate[],
  purchases: PlannedPurchase[],
  taken: Set<ISODate>,
): { date: ISODate; reason: string } | null {
  const base = incomes[0] ?? days[Math.min(days.length - 1, Math.floor(days.length * 0.6))];
  const weekendish = want.bucket !== 'shopping';
  const startIdx = Math.max(0, days.indexOf(base));
  const order = [...days.slice(startIdx), ...days.slice(0, startIdx).reverse()];
  for (const d of order) {
    if (taken.has(d)) continue;
    if (weekendish && ![5, 6].includes(dayOfWeek(d))) continue;
    if (!cumulativeFits(input, purchases, d, p.pricePence)) continue;
    let reason: string;
    if (incomes.includes(d)) reason = 'payday — money just landed';
    else if (weekendish) reason = d < base ? `${WEEKDAYS[dayOfWeek(d)]} — fits before payday` : `${WEEKDAYS[dayOfWeek(d)]} night out`;
    else if (incomes.length && d > base) reason = 'just after payday';
    else reason = 'later in the month, once essentials are covered';
    return { date: d, reason };
  }
  // Weekend-only search failed: allow any day.
  if (weekendish) return placeWant(input, { ...want, bucket: 'shopping' }, p, days, incomes, purchases, taken);
  return null;
}

/** Earliest violated constraint date (budget counts as a cap on the end date), or null if it all fits. */
function violation(input: ScheduleInput, b: Build): ISODate | null {
  const budget = Math.max(0, input.budgetPence);
  const caps = [...(input.caps ?? []), { date: input.end, cap: budget }].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const c of caps) {
    const cum = b.purchases.filter((p) => p.date <= c.date).reduce((s, p) => s + p.amount.pence, 0);
    if (cum > c.cap) return c.date;
  }
  return null;
}

// ---------- main ----------

export function scheduleItinerary(input: ScheduleInput): ScheduleResult {
  const { catalog, prefs, answers } = input;
  const budget = Math.max(0, Math.floor(input.budgetPence));
  const base: Level = {
    treatsPerWeek: Math.max(0, Math.min(3, Math.floor(prefs.treatsPerWeek))),
    payday: true,
    treatTier: true,
    normal: 'mixed',
    lean: false,
    lunches: false,
    trips: false,
    dropWants: [],
  };
  const upgrades: { level: Level; note: (b: Build) => string[] }[] = [
    {
      level: { ...base, lunches: true, trips: true, treatsPerWeek: Math.min(3, base.treatsPerWeek + 1) },
      note: (b) => [
        'Room to spare: added an extra treat night each week, packed lunches on commute days' +
          (b.tripDays ? ` and ${b.tripDays} off-peak weekend trip${b.tripDays === 1 ? '' : 's'}.` : '.'),
      ],
    },
    {
      level: { ...base, lunches: true, trips: true },
      note: (b) => [
        'Room to spare: added packed lunches on commute days' +
          (b.tripDays ? ` and ${b.tripDays} off-peak weekend trip${b.tripDays === 1 ? '' : 's'}.` : '.'),
      ],
    },
    {
      level: { ...base, trips: true },
      note: (b) => (b.tripDays ? [`Room to spare: added ${b.tripDays} off-peak weekend trip${b.tripDays === 1 ? '' : 's'}.`] : []),
    },
  ];
  const fits = (b: Build) => violation(input, b) === null;
  const noSkip = new Set<ISODate>();

  let chosen: Build | null = null;
  const adjust: string[] = [];

  for (const u of upgrades) {
    if (u.level.treatsPerWeek === base.treatsPerWeek && u === upgrades[0]) continue;
    const b = buildPlan(input, u.level, noSkip);
    if (fits(b) && b.total <= budget * (1 - UPGRADE_BUFFER)) {
      chosen = b;
      adjust.push(...u.note(b));
      break;
    }
  }

  let baseBuild: Build | null = null;
  if (!chosen) {
    baseBuild = buildPlan(input, base, noSkip);
    if (fits(baseBuild)) chosen = baseBuild;
  }

  let leanest = base;
  if (!chosen) {
    const fmt = formatMoney(budget);
    // Downgrade ladder.
    const steps: { level: Level; note: (b: Build) => string }[] = [];
    let lvl: Level = { ...base, lean: true };
    if ((input.incomeDates ?? []).length) steps.push({ level: lvl, note: () => 'Kept the two days before payday lean (budget dinners).' });
    lvl = { ...lvl, treatTier: false, payday: false };
    steps.push({ level: lvl, note: () => baseBuild!.treatDays === 0 ? 'Skipped the payday treat.' : `Swapped ${baseBuild!.treatDays} treat dinner${baseBuild!.treatDays === 1 ? '' : 's'} for standard ones to fit ${fmt}.` });
    lvl = { ...lvl, normal: 'budget' };
    steps.push({ level: lvl, note: () => 'Switched everyday dinners to budget recipes.' });
    const wants = catalog.wants
      .filter((w) => !answers.droppedWants.includes(w.id) && catalog.products[w.productId])
      .sort((a, b) => catalog.products[b.productId].pricePence - catalog.products[a.productId].pricePence);
    for (const w of wants) {
      lvl = { ...lvl, dropWants: [...lvl.dropWants, w.id] };
      const price = catalog.products[w.productId].pricePence;
      steps.push({ level: lvl, note: () => `Dropped ${w.label} (${formatMoney(price)}) — it doesn't fit ${fmt} this period.` });
    }
    leanest = lvl;
    for (const s of steps) {
      adjust.push(s.note(baseBuild!));
      const b = buildPlan(input, s.level, noSkip);
      if (fits(b)) {
        chosen = b;
        break;
      }
    }
  }

  if (!chosen) {
    // Last resort: leave the latest days before the violated date unplanned until everything fits.
    const skip = new Set<ISODate>();
    const days = dateRange(input.start, input.end);
    let b = buildPlan(input, leanest, skip);
    for (let v = violation(input, b); v !== null; v = violation(input, b)) {
      const candidate = [...days].reverse().find((d) => d <= v && !skip.has(d) && b.purchases.some((p) => p.date === d && p.amount.pence > 0));
      if (!candidate) {
        // Nothing left to remove: plan nothing.
        b = { ...b, purchases: [], total: 0 };
        break;
      }
      skip.add(candidate);
      b = buildPlan(input, leanest, skip);
    }
    chosen = b;
  }

  const purchases = chosen.purchases;
  const byBucket = { groceries: 0, transport: 0, eatingOut: 0, shopping: 0 };
  const cat = input.categories;
  for (const p of purchases) {
    const v = p.amount.pence;
    if (p.id.endsWith('-groceries')) byBucket.groceries += v;
    else if (p.id.endsWith('-transport')) byBucket.transport += v;
    else if (p.category === cat.eatingOut) byBucket.eatingOut += v;
    else byBucket.shopping += v;
  }
  const totalPence = chosen.total;
  const notes = [...adjust, ...chosen.notes];
  if (chosen.treatDays && !adjust.some((n) => n.startsWith('Swapped'))) notes.push(`${chosen.treatDays} treat dinner${chosen.treatDays === 1 ? '' : 's'} on Fridays/Saturdays${(input.incomeDates ?? []).length ? ' and payday' : ''}.`);
  if (chosen.leftoverMeals) notes.push(`${chosen.leftoverMeals} days reuse leftovers from earlier shops, so they cost less.`);
  if (Object.values(answers.owned).some(Boolean)) notes.push('Things already in your cupboard cost £0.');
  notes.push(`${formatMoney(budget - totalPence)} left unassigned as a buffer.`);

  const result: ScheduleResult = {
    purchases,
    totalPence,
    leftoverPence: budget - totalPence,
    byBucket,
    questions: [],
    notes,
  };
  result.questions = buildQuestions(catalog, result, answers);
  return result;
}
