/** Small self-contained calendar helpers (ISO days, no time zones). */
const MS = 86_400_000;
const toOrd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS);
};
const fromOrd = (n: number) => new Date(n * MS).toISOString().slice(0, 10);

export const isValidISO = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && fromOrd(toOrd(s)) === s;
export const addDays = (s: string, n: number) => fromOrd(toOrd(s) + n);
/** 0 = Sunday */
export const weekday = (s: string) => new Date(toOrd(s) * MS).getUTCDay();
export const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
export const endOfMonth = (s: string) => {
  const [y, m] = s.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
};
export const firstOfNextMonth = (s: string, offset = 1) => {
  const [y, m] = s.split('-').map(Number);
  const t = y * 12 + (m - 1) + offset;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
};
export const sameDayNextMonth = (s: string) => {
  const [, , d] = s.split('-').map(Number);
  const f = firstOfNextMonth(s);
  const [y, m] = f.split('-').map(Number);
  return `${f.slice(0, 8)}${String(Math.min(d, daysInMonth(y, m))).padStart(2, '0')}`;
};
export const makeDate = (y: number, m1: number, d: number): string | null => {
  const s = `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISO(s) ? s : null;
};
