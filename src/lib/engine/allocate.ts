/**
 * Allocation strategy: day totals as even as possible ("water level"), subject to
 *  - prefix caps (cash availability): Σ_{j<=i} T[j] <= caps[i] (caps non-decreasing, last = P)
 *  - per-day lower bounds (money already spent or set aside, kept-available amounts).
 * When the cash cap binds before an income date, the earlier window gets a lower,
 * still even, allowance; it never borrows from money that arrives later.
 */
import { evenSplitLatest, largestRemainder } from './money';

interface Segment { start: number; end: number; total: number }

/** Taut-string segmentation of prefix caps (last cap = budget). */
function segments(caps: number[]): Segment[] {
  const m = caps.length;
  const out: Segment[] = [];
  let s = 0, used = 0;
  while (s < m) {
    let bestK = s, bestNum = caps[s] - used, bestDen = 1;
    for (let k = s + 1; k < m; k++) {
      const num = caps[k] - used, den = k - s + 1;
      if (num * bestDen <= bestNum * den) { bestK = k; bestNum = num; bestDen = den; }
    }
    out.push({ start: s, end: bestK, total: bestNum });
    used = caps[bestK];
    s = bestK + 1;
  }
  return out;
}

/** Returns integer day totals summing to P (requires Σlb <= P and prefix(lb) <= caps). */
export function allocateDayTotals(P: number, caps: number[], lb: number[]): number[] {
  const n = caps.length;
  if (n === 0) return [];
  const fixed = new Array<boolean>(n).fill(false);
  for (;;) {
    const out = new Array<number>(n).fill(0);
    const fp = new Array<number>(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { out[i] = lb[i]; acc += lb[i]; }
      fp[i] = acc;
    }
    const free: number[] = [];
    for (let i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    const B = P - acc;
    if (free.length === 0) return out;
    const fc = free.map((fi, k) => {
      const end = k + 1 < free.length ? free[k + 1] - 1 : n - 1;
      let m = Infinity;
      for (let i = fi; i <= end; i++) m = Math.min(m, caps[i] - fp[i]);
      return Math.min(m, B);
    });
    fc[fc.length - 1] = B;
    const segs = segments(fc);
    let changed = false;
    for (const sg of segs) {
      const len = sg.end - sg.start + 1;
      for (let k = sg.start; k <= sg.end; k++)
        if (sg.total < lb[free[k]] * len) { fixed[free[k]] = true; changed = true; }
    }
    if (!changed) {
      for (const sg of segs) {
        const parts = evenSplitLatest(Math.max(0, sg.total), sg.end - sg.start + 1);
        for (let k = sg.start; k <= sg.end; k++) out[free[k]] = parts[k - sg.start];
      }
      return out;
    }
  }
}

export interface SplitCat {
  weight: number;
  /** Hard lower bound: money already used in this cell. */
  hard: number;
  /** Soft daily floor (essentials' minimumDaily), 0 if none. */
  floor: number;
}

/** Split a day total across categories: hard bounds first, then essential floors,
 * then weights (largest remainder; ties by category order). */
export function splitDay(T: number, cats: SplitCat[]): { amounts: number[]; essentialShort: number } {
  const n = cats.length;
  const amounts = cats.map((c) => c.hard);
  const R = T - amounts.reduce((a, b) => a + b, 0);
  if (R <= 0) return { amounts, essentialShort: cats.reduce((a, c) => a + Math.max(0, c.floor - c.hard), 0) };
  const soft = cats.map((c) => Math.max(0, c.floor - c.hard));
  const needSoft = soft.reduce((a, b) => a + b, 0);
  if (needSoft > R) {
    const give = largestRemainder(R, soft);
    return { amounts: amounts.map((a, i) => a + give[i]), essentialShort: needSoft - R };
  }
  const lb = cats.map((c, i) => c.hard + soft[i]);
  const fixed = cats.map((c) => !(c.weight > 0));
  for (;;) {
    const fixedSum = lb.reduce((a, x, i) => a + (fixed[i] ? x : 0), 0);
    const Rf = T - fixedSum;
    const freeIdx = [...Array(n).keys()].filter((i) => !fixed[i]);
    if (freeIdx.length === 0) {
      // Every weighted category sits at its bound: spread what is left by weight.
      const extra = largestRemainder(Rf, cats.map((c) => Math.max(0, c.weight)));
      return { amounts: lb.map((x, i) => x + extra[i]), essentialShort: 0 };
    }
    const Wf = freeIdx.reduce((a, i) => a + cats[i].weight, 0);
    let changed = false;
    for (const i of freeIdx)
      if (Rf * cats[i].weight < lb[i] * Wf) { fixed[i] = true; changed = true; }
    if (!changed) {
      const parts = largestRemainder(Rf, freeIdx.map((i) => cats[i].weight));
      const out = lb.map((x, i) => (fixed[i] ? x : 0));
      freeIdx.forEach((i, k) => (out[i] = parts[k]));
      return { amounts: out, essentialShort: 0 };
    }
  }
}
