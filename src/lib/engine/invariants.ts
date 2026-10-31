import { capSeries, cellKey, cellUseMap } from './accounting';
import { accountingTotals, futureDays } from './plan';
import type { EngineState, ISODate } from './types';

/** Cash availability (I3): for every day t from today, flexible planned spending up to t
 * must fit within Cap(t), except where money already spent/set aside forces it over. */
export function cashViolations(s: EngineState, today: ISODate, planned: Map<string, number>): ISODate[] {
  const W = futureDays(s, today);
  if (!W.length) return [];
  const caps = capSeries(s, today, W);
  const uses = cellUseMap(s);
  const plannedByDay = new Map<ISODate, number>();
  const useByDay = new Map<ISODate, number>();
  for (const [k, v] of planned) {
    const d = k.slice(0, 10);
    if (d >= today) plannedByDay.set(d, (plannedByDay.get(d) ?? 0) + v);
  }
  for (const [k, v] of uses) {
    const d = k.slice(0, 10);
    if (d >= today) useByDay.set(d, (useByDay.get(d) ?? 0) + v);
  }
  const bad: ISODate[] = [];
  let p = 0, u = 0;
  W.forEach((d, i) => {
    p += plannedByDay.get(d) ?? 0;
    u += useByDay.get(d) ?? 0;
    if (p > Math.max(caps[i], u)) bad.push(d);
  });
  return bad;
}

export function plannedMapOf(s: EngineState): Map<string, number> {
  return new Map((s.plan?.allocations ?? []).map((a) => [cellKey(a.day, a.category), a.planned.pence]));
}

/** Returns a list of violated invariants (empty = all hold). */
export function checkInvariants(s: EngineState, today: ISODate): string[] {
  const out: string[] = [];
  const plan = s.plan;
  if (!plan) return ['no plan'];
  const t = accountingTotals(s, today);
  let flex = 0;
  for (const a of plan.allocations) if (a.day >= today) flex += a.planned.pence;
  const lhs = t.balanceSOD + t.inflow + plan.fundingGap.pence;
  const rhs = t.bills + t.reserve + t.savings + flex + plan.unallocated.pence;
  if (lhs !== rhs) out.push(`I1 balance: ${lhs} != ${rhs}`);

  for (const a of plan.allocations) {
    if (a.planned.pence < 0 || a.actual.pence < 0) out.push(`I2 negative cell ${a.day} ${a.category}`);
    if (!Number.isSafeInteger(a.planned.pence) || a.planned.currency !== 'GBP') out.push(`money type ${a.day}`);
  }
  for (const [k, v] of Object.entries(plan.summary)) if (v.pence < 0) out.push(`I2 negative summary ${k}`);
  if (plan.unallocated.pence < 0 || plan.fundingGap.pence < 0) out.push('I2 negative unallocated/gap');
  for (const d of plan.deficits) if (d.amount.pence <= 0) out.push(`I2 non-positive deficit ${d.kind}`);

  const uses = cellUseMap(s);
  for (const a of plan.allocations)
    if (a.day >= today && a.planned.pence < (uses.get(cellKey(a.day, a.category)) ?? 0))
      out.push(`I6 planned below use ${a.day} ${a.category}`);

  const bad = cashViolations(s, today, plannedMapOf(s));
  if (bad.length) out.push(`I3 cash on ${bad.join(',')}`);
  return out;
}
