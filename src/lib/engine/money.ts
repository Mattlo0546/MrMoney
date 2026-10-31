import type { Money } from './types';

export function gbp(pence: number): Money {
  if (!Number.isSafeInteger(pence)) throw new Error(`Money must be integer pence, got ${pence}`);
  return { pence: pence === 0 ? 0 : pence, currency: 'GBP' };
}

export const ZERO: Money = gbp(0);

export function isMoney(x: unknown): x is Money {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as Money).currency === 'GBP' &&
    Number.isSafeInteger((x as Money).pence)
  );
}

/** £1,234.50 / £5 (pence dropped when .00) / -£3.20 */
export function formatMoney(m: Money | number): string {
  const p = typeof m === 'number' ? m : m.pence;
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const pen = abs % 100;
  const s = pen === 0 ? `£${pounds}` : `£${pounds}.${pen.toString().padStart(2, '0')}`;
  return p < 0 ? `-${s}` : s;
}

/** Split `total` (>= 0) by non-negative integer-ish weights with the largest-remainder
 * method. Ties go to the earliest index (stable order). Returns integers summing to total.
 * If every weight is zero, returns all zeros except total on index 0 (caller avoids this). */
export function largestRemainder(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0) {
    const out = new Array(n).fill(0);
    out[0] = total;
    return out;
  }
  // Scale weights to integers to keep the arithmetic exact.
  const scale = weights.every(Number.isInteger) ? 1 : 1e6;
  const w = weights.map((x) => Math.round(x * scale));
  const Wi = w.reduce((a, b) => a + b, 0);
  const base = w.map((x) => Math.floor((total * x) / Wi));
  const rem = w.map((x, i) => total * x - base[i] * Wi);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = w.map((_, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) base[order[k]]++;
  return base;
}

/** Spread `total` evenly over n slots; remainder pence go to the LAST slots
 * (cash-safe: every prefix stays <= its pro-rata share). */
export function evenSplitLatest(total: number, n: number): number[] {
  if (n <= 0) return [];
  const q = Math.floor(total / n);
  const r = total - q * n;
  return Array.from({ length: n }, (_, i) => q + (i >= n - r ? 1 : 0));
}

/** Largest single amount the engine accepts: £10,000,000 (keeps all sums safe integers). */
export const MAX_PENCE = 1_000_000_000;
