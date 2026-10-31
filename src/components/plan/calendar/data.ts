import { addDays, dateRange, endOfMonth, ensurePlan, occurrences } from '@/lib/engine';
import type { DeficitItem, EngineState, ISODate, ItemRef, PurchaseLine } from '@/lib/engine';

export interface FixedItem { id: string; name: string; pence: number }
export interface EntryItem {
  id: string; kind: 'expense' | 'income'; category?: string; label: string; pence: number; note?: string;
  originalPence?: number; dealTitle?: string; dealPercentOff?: number;
}
export interface PlannedItem { category: string; name: string; planned: number; actual: number }
export type Bucket = 'groceries' | 'transport' | 'eatingOut' | 'shopping' | 'other';
export interface PurchaseItem {
  id: string; label: string; pence: number; category: string; categoryName: string; bucket: Bucket;
  /** Itemised breakdown (creative spending plan). */
  lines?: PurchaseLine[]; reason?: string; source?: 'itinerary'; ref?: ItemRef;
  originalPence?: number; dealTitle?: string; dealPercentOff?: number;
}

/** Which kind of spending a category is, from its id/name (and, as a tie-breaker, the merchant of its lines). */
export function bucketOf(categoryId: string, categoryName: string, lines?: PurchaseLine[]): Bucket {
  const s = `${categoryId} ${categoryName}`.toLowerCase();
  if (/groc|food shop|supermarket/.test(s)) return 'groceries';
  if (/transport|travel|commute|tfl|tube|bus|fare/.test(s)) return 'transport';
  if (/eat|restaurant|takeaway|dining|meal/.test(s)) return 'eatingOut';
  if (/shop|cloth|fashion|stuff|want/.test(s)) return 'shopping';
  if (/food/.test(s)) return 'groceries';
  if (lines?.some((l) => l.ref.domain === 'tfl.gov.uk')) return 'transport';
  return 'other';
}

export interface DayInfo {
  date: ISODate;
  /** Inside the plan window (planStart..horizonEnd). Outside it only history (bills, actuals) is shown. */
  inPlan: boolean;
  fixed: FixedItem[];
  fixedTotal: number;
  items: PlannedItem[];
  plannedFlexible: number;
  /** Planned flexible money for the day (bills are shown as chips). Planned, not spent. */
  total: number;
  /** Total student deal discount saved on this calendar day (pence). */
  savedPence: number;
  /** Pre-discount total for the day (total + savedPence). */
  originalTotal: number;
  /** Student deals applied to this day. */
  dealLabels: string[];
  entries: EntryItem[];
  purchases: PurchaseItem[];
  deficits: DeficitItem[];
}

export interface PlanData {
  days: Map<ISODate, DayInfo>;
  start: ISODate;
  end: ISODate;
  /** First and last navigable months (YYYY-MM). */
  minMonth: string;
  maxMonth: string;
  undated: DeficitItem[];
  fundingGap: number;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildPlanData(state: EngineState, today: ISODate): PlanData {
  const plan = state.plan ?? ensurePlan(state, today).plan!;
  const { planStart: start, horizonEnd: end } = state.profile;
  const names = new Map(state.profile.categories.map((c) => [c.id, c.name]));
  const days = new Map<ISODate, DayInfo>();
  const shiftM = (ym: string, n: number) => {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  // Never look back more than a year: a mistyped date (e.g. year 0007 from a half-typed date field) must not
  // crash or hang the calendar.
  const earliest = addDays(start, -365);
  let histStart = start;
  for (const t of state.ledger) if (t.date < histStart && t.date >= earliest) histStart = t.date;
  for (const i of state.incomes) if (i.confirmed && i.date < histStart && i.date >= earliest) histStart = i.date;
  // Render from a month before the earliest history/plan so past bills and actuals are visible.
  const rangeStart = addDays(`${shiftM(histStart.slice(0, 7), -1)}-01`, -7);
  const rangeEnd = addDays(endOfMonth(end), 7);
  for (const d of dateRange(rangeStart, rangeEnd)) {
    days.set(d, { date: d, inPlan: d >= start && d <= end, fixed: [], fixedTotal: 0, items: [], plannedFlexible: 0, total: 0, entries: [], purchases: [], deficits: [], savedPence: 0, originalTotal: 0, dealLabels: [] });
  }
  for (const c of state.commitments) {
    for (const o of occurrences(c, rangeStart, rangeEnd)) {
      const day = days.get(o.date);
      if (!day) continue;
      day.fixed.push({ id: `${o.commitmentId}@${o.date}`, name: o.name, pence: o.pence });
      day.fixedTotal += o.pence;
    }
  }
  for (const a of plan.allocations) {
    const day = days.get(a.day);
    if (!day || (a.planned.pence <= 0 && a.actual.pence <= 0)) continue;
    day.items.push({ category: a.category, name: names.get(a.category) ?? titleCase(a.category), planned: a.planned.pence, actual: a.actual.pence });
    day.plannedFlexible += a.planned.pence;
  }
  // Money set aside for a planned purchase is already inside its category's planned cell. The category row only
  // shows what is left over (in itemised mode usually nothing), so the purchase is never counted twice.
  const earmarked = new Map<string, number>();
  for (const t of state.ledger) {
    // The ledger holds both expenses and income (an "I received" intent is a ledger transaction of kind 'income').
    const income = t.kind === 'income';
    days.get(t.date)?.entries.push({
      id: t.id, kind: income ? 'income' : 'expense', category: t.category,
      label: income ? t.note ?? 'Income' : t.category ? names.get(t.category) ?? titleCase(t.category) : 'Expense', pence: t.amount.pence, note: t.note,
      ...(t.originalPence !== undefined ? { originalPence: t.originalPence } : {}),
      ...(t.dealTitle ? { dealTitle: t.dealTitle } : {}),
      ...(t.dealPercentOff !== undefined ? { dealPercentOff: t.dealPercentOff } : {}),
    });
  }
  const seen = new Set(state.ledger.map((t) => t.id));
  for (const i of state.incomes) {
    if (i.confirmed && !seen.has(i.id)) days.get(i.date)?.entries.push({ id: i.id, kind: 'income', label: i.note ?? 'Income', pence: i.amount.pence, note: i.note });
  }
  // A planned purchase completed by a linked actual is consumed by it: the actual shows (as spent), the plan does not.
  const consumed = new Set<string>();
  for (const t of state.ledger) if (t.kind === 'expense' && t.plannedPurchaseId) consumed.add(t.plannedPurchaseId);
  for (const p of state.plannedPurchases) {
    if (consumed.has(p.id)) continue;
    const day = days.get(p.date);
    if (!day) continue;
    const categoryName = names.get(p.category) ?? titleCase(p.category);
    day.purchases.push({
      id: p.id, label: p.label, pence: p.amount.pence, category: p.category, categoryName, bucket: bucketOf(p.category, categoryName, p.lines),
      lines: p.lines, reason: p.reason, source: p.source, ref: p.ref,
      ...(p.originalPence !== undefined ? { originalPence: p.originalPence } : {}),
      ...(p.dealTitle ? { dealTitle: p.dealTitle } : {}),
      ...(p.dealPercentOff !== undefined ? { dealPercentOff: p.dealPercentOff } : {}),
    });
    const k = `${p.date}|${p.category}`;
    earmarked.set(k, (earmarked.get(k) ?? 0) + p.amount.pence);
  }
  for (const day of days.values()) {
    if (!day.purchases.length) continue;
    day.items = day.items
      .map((it) => ({ ...it, planned: Math.max(0, it.planned - (earmarked.get(`${day.date}|${it.category}`) ?? 0)) }))
      .filter((it) => it.planned > 0 || it.actual > 0);
  }
  const undated: DeficitItem[] = [];
  for (const d of plan.deficits) {
    const day = d.date ? days.get(d.date) : undefined;
    if (day) day.deficits.push(d);
    else undated.push(d);
  }
  const evenDeals = (state.profile.appliedDeals ?? []).filter((ad) => (ad.dailySavedPence ?? 0) > 0);
  for (const day of days.values()) {
    day.total = day.plannedFlexible;
    let saved = 0;
    const labels = new Set<string>();
    for (const p of day.purchases) {
      if (p.originalPence !== undefined && p.originalPence > p.pence) {
        saved += p.originalPence - p.pence;
        if (p.dealTitle) labels.add(p.dealTitle);
      }
    }
    for (const e of day.entries) {
      if (e.kind === 'expense' && e.originalPence !== undefined && e.originalPence > e.pence) {
        saved += e.originalPence - e.pence;
        if (e.dealTitle) labels.add(e.dealTitle);
      }
    }
    if (day.inPlan && day.date >= today && day.total > 0) {
      for (const ad of evenDeals) {
        saved += ad.dailySavedPence ?? 0;
        labels.add(ad.title);
      }
    }
    day.savedPence = saved;
    day.originalTotal = day.total + saved;
    day.dealLabels = [...labels];
  }
  let minMonth = start.slice(0, 7);
  for (const d of days.values()) {
    if (d.date >= `${shiftM(histStart.slice(0, 7), -1)}-01` && d.date.slice(0, 7) < minMonth && (d.fixed.length > 0 || d.entries.length > 0)) minMonth = d.date.slice(0, 7);
  }
  const maxMonth = end.slice(0, 7);
  return { days, start, end, minMonth, maxMonth, undated, fundingGap: plan.fundingGap.pence };
}
