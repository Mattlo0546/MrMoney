import type { ISODate } from './types';

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function parseISODate(s: string): { y: number; m: number; d: number } | null {
  const m = RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && parseISODate(s) !== null;
}

export function toOrdinal(s: ISODate): number {
  const p = parseISODate(s);
  if (!p) throw new Error(`Invalid ISO date: ${s}`);
  return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
}

export function fromOrdinal(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function makeDate(y: number, month1: number, day: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const addDays = (s: ISODate, n: number): ISODate => fromOrdinal(toOrdinal(s) + n);

/** Inclusive day count from a to b (0 if b < a). */
export const daysInclusive = (a: ISODate, b: ISODate): number => Math.max(0, toOrdinal(b) - toOrdinal(a) + 1);

export function dateRange(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let o = toOrdinal(a), e = toOrdinal(b); o <= e; o++) out.push(fromOrdinal(o));
  return out;
}

/** 0 = Sunday … 6 = Saturday */
export const dayOfWeek = (s: ISODate): number => (toOrdinal(s) + 4) % 7; // 1970-01-01 was a Thursday

export function endOfMonth(s: ISODate): ISODate {
  const p = parseISODate(s)!;
  return makeDate(p.y, p.m, daysInMonth(p.y, p.m));
}

/** "10 Nov" */
export function formatShortDate(s: ISODate): string {
  const p = parseISODate(s)!;
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

export const minDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b);
