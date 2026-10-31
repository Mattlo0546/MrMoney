'use client';
/**
 * The store has no projection-assumptions slot, so the Projections page keeps its inputs under
 * `mrmoney.projections.v1` (strings, pounds/percent). The chat writes the confirmed base rate there.
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
