import { addDays, dateRange, endOfMonth, ensurePlan, occurrences } from '@/lib/engine';
import type { DeficitItem, EngineState, ISODate } from '@/lib/engine';

export interface FixedItem { id: string; name: string; pence: number }
export interface EntryItem { id: string; kind: 'expense' | 'income'; category?: string; label: string; pence: number; note?: string }
export interface PlannedItem { category: string; name: string; planned: number; actual: number }
export interface PurchaseItem { id: string; label: string; pence: number; category: string }

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
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  let histStart = start;
  for (const t of state.ledger) if (t.date < histStart) histStart = t.date;
  for (const i of state.incomes) if (i.confirmed && i.date < histStart) histStart = i.date;
  // Render from a month before the earliest history/plan so past bills and actuals are visible.
  const rangeStart = addDays(`${shiftM(histStart.slice(0, 7), -1)}-01`, -7);
  const rangeEnd = addDays(endOfMonth(end), 7);
  for (const d of dateRange(rangeStart, rangeEnd)) {
    days.set(d, { date: d, inPlan: d >= start && d <= end, fixed: [], fixedTotal: 0, items: [], plannedFlexible: 0, total: 0, entries: [], purchases: [], deficits: [] });
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
  for (const t of state.ledger) {
    // The ledger holds both expenses and income (an "I received" intent is a ledger transaction of kind 'income').
    const income = t.kind === 'income';
    days.get(t.date)?.entries.push({
      id: t.id, kind: income ? 'income' : 'expense', category: t.category,
      label: income ? t.note ?? 'Income' : t.category ? names.get(t.category) ?? titleCase(t.category) : 'Expense', pence: t.amount.pence, note: t.note,
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
    days.get(p.date)?.purchases.push({ id: p.id, label: p.label, pence: p.amount.pence, category: p.category });
  }
  const undated: DeficitItem[] = [];
  for (const d of plan.deficits) {
    const day = d.date ? days.get(d.date) : undefined;
    if (day) day.deficits.push(d);
    else undated.push(d);
  }
  for (const day of days.values()) day.total = day.plannedFlexible;
  let minMonth = start.slice(0, 7);
  for (const d of days.values()) {
    if (d.date >= `${shiftM(histStart.slice(0, 7), -1)}-01` && d.date.slice(0, 7) < minMonth && (d.fixed.length > 0 || d.entries.length > 0)) minMonth = d.date.slice(0, 7);
  }
  const maxMonth = end.slice(0, 7);
  return { days, start, end, minMonth, maxMonth, undated, fundingGap: plan.fundingGap.pence };
}
