import { dateRange, ensurePlan, occurrences } from '@/lib/engine';
import type { DeficitItem, EngineState, ISODate } from '@/lib/engine';

export interface FixedItem { id: string; name: string; pence: number }
export interface EntryItem { id: string; kind: 'expense' | 'income'; category?: string; label: string; pence: number; note?: string }
export interface PlannedItem { category: string; name: string; planned: number; actual: number }
export interface PurchaseItem { id: string; label: string; pence: number }

export interface DayInfo {
  date: ISODate;
  fixed: FixedItem[];
  fixedTotal: number;
  items: PlannedItem[];
  plannedFlexible: number;
  /** fixed commitments + planned flexible money. Planned, not spent. */
  total: number;
  entries: EntryItem[];
  purchases: PurchaseItem[];
  deficits: DeficitItem[];
}

export interface PlanData {
  days: Map<ISODate, DayInfo>;
  start: ISODate;
  end: ISODate;
  undated: DeficitItem[];
  fundingGap: number;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildPlanData(state: EngineState, today: ISODate): PlanData {
  const plan = state.plan ?? ensurePlan(state, today).plan!;
  const { planStart: start, horizonEnd: end } = state.profile;
  const names = new Map(state.profile.categories.map((c) => [c.id, c.name]));
  const days = new Map<ISODate, DayInfo>();
  for (const d of dateRange(start, end)) {
    days.set(d, { date: d, fixed: [], fixedTotal: 0, items: [], plannedFlexible: 0, total: 0, entries: [], purchases: [], deficits: [] });
  }
  for (const c of state.commitments) {
    for (const o of occurrences(c, start, end)) {
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
    days.get(t.date)?.entries.push({
      id: t.id, kind: 'expense', category: t.category, label: t.category ? names.get(t.category) ?? titleCase(t.category) : 'Expense', pence: t.amount.pence, note: t.note,
    });
  }
  for (const i of state.incomes) {
    if (i.confirmed) days.get(i.date)?.entries.push({ id: i.id, kind: 'income', label: i.note ?? 'Income', pence: i.amount.pence, note: i.note });
  }
  for (const p of state.plannedPurchases) days.get(p.date)?.purchases.push({ id: p.id, label: p.label, pence: p.amount.pence });
  const undated: DeficitItem[] = [];
  for (const d of plan.deficits) {
    const day = d.date ? days.get(d.date) : undefined;
    if (day) day.deficits.push(d);
    else undated.push(d);
  }
  for (const day of days.values()) day.total = day.fixedTotal + day.plannedFlexible;
  return { days, start, end, undated, fundingGap: plan.fundingGap.pence };
}
