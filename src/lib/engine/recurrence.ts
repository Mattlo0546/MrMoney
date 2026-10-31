import { daysInMonth, makeDate, parseISODate } from './dates';
import type { Commitment, ISODate } from './types';

export interface Occurrence {
  commitmentId: string;
  name: string;
  date: ISODate;
  pence: number;
}

/** Amount of a commitment on a given date, honouring dated amount changes. */
export function amountOn(c: Commitment, date: ISODate): number {
  let p = c.amount.pence;
  for (const ch of c.amountChanges ?? []) if (ch.from <= date) p = ch.amount.pence;
  return p;
}

/** Due dates of a commitment in [from, to]. Monthly day N is clamped to the month's
 * length (31 → 30 Nov, 29/28 Feb). */
export function occurrences(c: Commitment, from: ISODate, to: ISODate): Occurrence[] {
  if (to < from) return [];
  const out: Occurrence[] = [];
  const push = (date: ISODate) => {
    const pence = amountOn(c, date);
    if (pence > 0) out.push({ commitmentId: c.id, name: c.name, date, pence });
  };
  const r = c.recurrence;
  if (r.kind === 'once') {
    if (r.date >= from && r.date <= to) push(r.date);
    return out;
  }
  const a = parseISODate(from)!, b = parseISODate(to)!;
  let y = a.y, m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    const date = makeDate(y, m, Math.min(r.dayOfMonth, daysInMonth(y, m)));
    if (
      date >= from &&
      date <= to &&
      (!r.startDate || date >= r.startDate) &&
      (!r.endDate || date <= r.endDate)
    )
      push(date);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
