'use client';
import type { EngineState } from '@/lib/engine/types';
import { decideArgonAllocation, extractSeedFromEngineState } from '@/lib/finance/products';

/**
 * The store has no projection-assumptions slot, so the Projections page keeps its inputs under
 * `mrmoney.projections.v1` (strings, pounds/percent). The chat writes the confirmed base rate there,
 * and onboarding / lump-sum setup seeds Argon's full savings + investment allocation.
 */
const KEY = 'mrmoney.projections.v1';

type Inputs = Record<string, unknown>;

function read(): Inputs {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Inputs) : {};
  } catch {
    return {};
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/%$/, '')) : typeof v === 'number' ? v : NaN;
  return typeof v === 'string' && v.trim() === '' ? undefined : Number.isFinite(n) ? n : undefined;
};

export function readProjectionRates(): { savings?: number; investments?: number } {
  const v = read();
  const out: { savings?: number; investments?: number } = {};
  const s = num(v.sBase);
  const i = num(v.iBase);
  if (s !== undefined) out.savings = s;
  if (i !== undefined) out.investments = i;
  return out;
}

/**
 * Seeds `mrmoney.projections.v1` from the user's active lump sum budget in `EngineState` using
 * Argon's allocation engine so that all projection inputs and product choices are immediately populated.
 */
export function seedProjectionsFromState(state: EngineState | null): boolean {
  const seed = extractSeedFromEngineState(state);
  const decision = decideArgonAllocation(seed);
  const next = {
    months: 12,
    lumpSum: String(decision.lumpSumPounds),
    monthlySurplus: String(decision.monthlySurplusPounds),
    riskProfile: decision.riskProfile,
    savingsNow: String(decision.savingsNowPounds),
    savingsAdd: String(decision.savingsAddPounds),
    invNow: String(decision.invNowPounds),
    invAdd: String(decision.invAddPounds),
    income: String(decision.monthlyIncomePounds),
    sLow: String(decision.rates.sLow),
    sBase: String(decision.rates.sBase),
    sHigh: String(decision.rates.sHigh),
    iLow: String(decision.rates.iLow),
    iBase: String(decision.rates.iBase),
    iHigh: String(decision.rates.iHigh),
    selectedBankIds: decision.selectedBankIds,
    selectedStockIds: decision.selectedStockIds,
    rationale: decision.rationale,
    decidedBy: decision.decidedBy,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets the base rate for a bucket. When no savings amount has been entered yet, the plan's planned savings
 * (an engine number) is used as the starting balance so the projection has something to grow.
 */
export function writeProjectionRate(bucket: 'savings' | 'investments', ratePercent: number, plannedSavingsPence: number): boolean {
  const v = read();
  const next: Inputs = { months: 12, ...v };
  if (bucket === 'savings') {
    next.sBase = String(ratePercent);
    const hasAmount = [v.savingsNow, v.savingsAdd].some((x) => typeof x === 'string' && x.trim() !== '' && Number(x) > 0);
    if (!hasAmount && plannedSavingsPence > 0) {
      next.savingsNow = plannedSavingsPence % 100 === 0 ? String(plannedSavingsPence / 100) : (plannedSavingsPence / 100).toFixed(2);
    }
  } else {
    next.iBase = String(ratePercent);
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
