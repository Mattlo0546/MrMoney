import { categoryName, cellKey } from './accounting';
import { gbp } from './money';
import { occurrences } from './recurrence';
import type { CategoryId, CategoryMove, CellChange, ChangeSet, EngineState, ISODate, Intent, ProtectedSnapshot } from './types';

export function protectedSnapshot(s: EngineState, today: ISODate): ProtectedSnapshot {
  return {
    commitments: s.commitments.map((c) => ({
      id: c.id,
      name: c.name,
      total: gbp(occurrences(c, today, s.profile.horizonEnd).reduce((a, o) => a + o.pence, 0)),
    })),
    minimumReserve: s.profile.minimumReserve,
    savingsGoal: s.profile.savingsGoal,
    plannedSavings: s.plan?.summary.plannedSavings ?? s.profile.savingsGoal,
    reserveShortfall: gbp((s.plan?.deficits ?? []).filter((d) => d.kind === 'reserve-short').reduce((a, d) => a + d.amount.pence, 0)),
  };
}

export function sameProtected(a: ProtectedSnapshot, b: ProtectedSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type Extras = Partial<Pick<ChangeSet,
  'amount' | 'target' | 'absorbed' | 'overspend' | 'dayRemainingBefore' | 'dayRemainingAfter' |
  'shortfall' | 'commitment' | 'savingsGoal' | 'replanned' | 'takenFromLater' | 'fromUnallocated' | 'uncovered' |
  'dayAvailableBefore' | 'borrowed' | 'tradeoff' | 'removedPurchase'>>;

export function computeDiff(
  before: EngineState, after: EngineState, intent: Intent, today: ISODate, extras: Extras = {},
): ChangeSet {
  const map = (s: EngineState) =>
    new Map((s.plan?.allocations ?? []).map((a) => [cellKey(a.day, a.category), a]));
  const A = map(before), B = map(after);
  const keys = [...new Set([...A.keys(), ...B.keys()])].sort();
  const cellChanges: CellChange[] = [];
  type Acc = Map<CategoryId, { amount: number; days: Set<ISODate> }>;
  const src: Acc = new Map(), add: Acc = new Map(), sdSrc: Acc = new Map(), sdAdd: Acc = new Map();
  const targetDay = extras.target?.day;
  const targetKey = extras.target ? cellKey(extras.target.day, extras.target.category) : null;
  for (const k of keys) {
    const [day, category] = k.split('|');
    const a = A.get(k), b = B.get(k);
    const pa = a?.planned.pence ?? 0, pb = b?.planned.pence ?? 0;
    const xa = a?.actual.pence ?? 0, xb = b?.actual.pence ?? 0;
    if (pa !== pb) cellChanges.push({ day, category, field: 'planned', from: gbp(pa), to: gbp(pb) });
    if (xa !== xb) cellChanges.push({ day, category, field: 'actual', from: gbp(xa), to: gbp(xb) });
    if (pa !== pb && k !== targetKey) {
      const sameDay = day === targetDay;
      const m = pb < pa ? (sameDay ? sdSrc : src) : sameDay ? sdAdd : add;
      if (!m.has(category)) m.set(category, { amount: 0, days: new Set() });
      m.get(category)!.amount += Math.abs(pb - pa);
      m.get(category)!.days.add(day);
    }
  }
  const moves = (m: Acc): CategoryMove[] =>
    (after.profile.categories.map((c) => c.id).concat([...m.keys()].sort()))
      .filter((c, i, arr) => m.has(c) && arr.indexOf(c) === i)
      .map((c) => ({
        category: c,
        categoryName: categoryName(after, c),
        amount: gbp(m.get(c)!.amount),
        days: [...m.get(c)!.days].sort(),
      }));
  const pb = protectedSnapshot(before, today), pa = protectedSnapshot(after, today);
  const beforeKeys = new Set(before.ledger.map((t) => t.id));
  return {
    intentKind: intent.kind,
    today,
    noop: false,
    cellChanges,
    changedDays: [...new Set(cellChanges.map((c) => c.day))].sort(),
    sources: moves(src),
    additions: moves(add),
    sameDaySources: moves(sdSrc),
    sameDayAdditions: moves(sdAdd),
    ledgerAdded: after.ledger.filter((t) => !beforeKeys.has(t.id)),
    summaryBefore: before.plan!.summary,
    summaryAfter: after.plan!.summary,
    fundingGapBefore: before.plan!.fundingGap,
    fundingGapAfter: after.plan!.fundingGap,
    protectedBefore: pb,
    protectedAfter: pa,
    protectedUnchanged: sameProtected(pb, pa),
    replanned: false,
    ...extras,
  };
}
