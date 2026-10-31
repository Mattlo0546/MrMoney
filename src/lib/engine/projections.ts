/**
 * Projections: savings, investment value and cumulative income over N months.
 * Monthly compounding of a user-entered annual rate (nominal, rate/12 per month),
 * contribution added at the end of each month; balances are carried unrounded and
 * rounded to the penny only when reported.
 * No rate is ever defaulted: missing rates give `needs-rates`.
 */
import { gbp } from './money';
import type { Money } from './types';

export type Scenario = 'low' | 'base' | 'high';
export type RateSet = Partial<Record<Scenario, number | null>>;

export interface ProjectionAssumptions {
  startSavings: Money;
  startInvestments: Money;
  monthlySavingsContribution: Money;
  monthlyInvestmentContribution: Money;
  /** Confirmed income expected within the period (counted once). */
  confirmedIncome: Money;
  /** Expected monthly income, e.g. unconfirmed job pay (projection only). */
  expectedMonthlyIncome: Money;
  /** Annual percentages, e.g. 3.5 for 3.5%. */
  savingsRatePct: RateSet;
  investmentReturnPct: RateSet;
}

export interface ProjectionPoint {
  month: number;
  savings: Money;
  investments: Money;
  total: Money;
  contributed: Money;
  /** total − contributed: interest and returns earned so far. */
  growth?: Money;
  cumulativeIncome: Money;
}

export type ProjectionResult =
  | { status: 'needs-rates'; missing: string[] }
  | { status: 'invalid'; message: string }
  | {
      status: 'ok';
      label: 'Projection, not advice or a guarantee';
      months: number;
      scenarios: Partial<Record<Scenario, ProjectionPoint[]>>;
      missing: string[];
    };

const SCEN: Scenario[] = ['low', 'base', 'high'];
const valid = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r) && r > -100;

export function project(a: ProjectionAssumptions, months: number): ProjectionResult {
  if (!Number.isInteger(months) || months < 1 || months > 600) return { status: 'invalid', message: 'Pick between 1 and 600 months.' };
  const needS = a.startSavings.pence > 0 || a.monthlySavingsContribution.pence > 0;
  const needI = a.startInvestments.pence > 0 || a.monthlyInvestmentContribution.pence > 0;
  const missing: string[] = [];
  for (const s of SCEN) {
    if (needS && !valid(a.savingsRatePct[s])) missing.push(`savingsRatePct.${s}`);
    if (needI && !valid(a.investmentReturnPct[s])) missing.push(`investmentReturnPct.${s}`);
  }
  const ready = SCEN.filter((s) => (!needS || valid(a.savingsRatePct[s])) && (!needI || valid(a.investmentReturnPct[s])));
  if ((needS || needI) && ready.length === 0) return { status: 'needs-rates', missing };
  const scenarios: Partial<Record<Scenario, ProjectionPoint[]>> = {};
  for (const sc of ready) {
    const rs = (valid(a.savingsRatePct[sc]) ? (a.savingsRatePct[sc] as number) : 0) / 1200;
    const ri = (valid(a.investmentReturnPct[sc]) ? (a.investmentReturnPct[sc] as number) : 0) / 1200;
    let sav = a.startSavings.pence, inv = a.startInvestments.pence;
    let contributed = sav + inv;
    const pts: ProjectionPoint[] = [];
    const point = (m: number) => ({
      month: m,
      savings: gbp(Math.round(sav)),
      investments: gbp(Math.round(inv)),
      total: gbp(Math.round(sav) + Math.round(inv)),
      contributed: gbp(contributed),
      growth: gbp(Math.round(sav) + Math.round(inv) - contributed),
      cumulativeIncome: gbp(a.confirmedIncome.pence + a.expectedMonthlyIncome.pence * m),
    });
    pts.push({ ...point(0), cumulativeIncome: gbp(0) });
    for (let m = 1; m <= months; m++) {
      sav = sav * (1 + rs) + a.monthlySavingsContribution.pence;
      inv = inv * (1 + ri) + a.monthlyInvestmentContribution.pence;
      contributed += a.monthlySavingsContribution.pence + a.monthlyInvestmentContribution.pence;
      pts.push(point(m));
    }
    scenarios[sc] = pts;
  }
  return { status: 'ok', label: 'Projection, not advice or a guarantee', months, scenarios, missing };
}
