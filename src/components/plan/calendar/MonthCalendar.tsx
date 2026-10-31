'use client';
import { useEffect, useMemo, useRef } from 'react';
import { addDays, dayOfWeek, daysInMonth } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import type { PlanData } from './data';
import { Chip, chipsFor, money } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ymOf = (d: ISODate) => d.slice(0, 7);
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export function MonthCalendar({
  data, today, month, onMonth, selected, onSelect, changed,
}: {
  data: PlanData; today: ISODate; month: string; onMonth: (ym: string) => void;
  selected: ISODate; onSelect: (d: ISODate) => void; changed: Set<string>;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01` as ISODate;
  const lead = (dayOfWeek(first) + 6) % 7;
  const n = daysInMonth(y, m);
  const cells = useMemo(() => {
    const out: (ISODate | null)[] = Array(lead).fill(null);
    for (let i = 1; i <= n; i++) out.push(`${month}-${String(i).padStart(2, '0')}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [month, lead, n]);
  const canPrev = shiftMonth(month, -1) >= ymOf(data.start);
  const canNext = shiftMonth(month, 1) <= ymOf(data.end);
  const focusDay = selected && ymOf(selected) === month ? selected : cells.find((c) => c && data.days.has(c)) ?? null;

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`)?.focus();
  }, [selected, month]);

  const onKey = (e: React.KeyboardEvent, d: ISODate) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(d, delta);
    if (!data.days.has(next)) return;
    focusNext.current = true;
    if (ymOf(next) !== month) onMonth(ymOf(next));
    onSelect(next);
  };

  return (
    <section aria-label="Month calendar" className="flex min-h-0 flex-1 flex-col rounded-3xl bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display mr-auto text-2xl font-extrabold">{MONTHS[m - 1]} {y}</h2>
        <button type="button" className="min-h-11 rounded-full bg-[var(--surface-2)] px-4 text-sm font-bold" onClick={() => { onMonth(ymOf(today)); onSelect(today); }}>Today</button>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => onMonth(shiftMonth(month, -1))} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40">‹</button>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => onMonth(shiftMonth(month, 1))} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40">›</button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-[var(--muted)]">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div ref={gridRef} role="grid" aria-label={`${MONTHS[m - 1]} ${y}`} className="grid flex-1 grid-cols-7 gap-1.5 [grid-auto-rows:minmax(92px,1fr)]">
        {cells.map((d, i) => {
          const info = d ? data.days.get(d) : undefined;
          if (!d || !info) return <div key={i} role="gridcell" aria-hidden className="rounded-2xl bg-[var(--bg)] opacity-30" />;
          const chips = chipsFor(info, changed);
          const shown = chips.slice(0, 2);
          const isToday = d === today;
          const past = d < today;
          const deficit = info.deficits.length > 0;
          const sel = d === selected;
          return (
            <div key={d} role="gridcell" aria-selected={sel} className="min-w-0">
              <button
                type="button"
                data-day={d}
                tabIndex={d === focusDay ? 0 : -1}
                aria-label={`${d}, planned ${money(info.total)}${deficit ? ', shortfall' : ''}${isToday ? ', today' : ''}`}
                onClick={() => onSelect(d)}
                onKeyDown={(e) => onKey(e, d)}
                className={`relative flex h-full w-full flex-col gap-1 rounded-2xl p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  sel ? 'bg-[var(--surface-2)]' : 'bg-[var(--bg)] hover:bg-[var(--surface-2)]'
                } ${isToday ? 'ring-2 ring-[var(--accent)]' : sel ? 'ring-1 ring-[var(--line)]' : ''} ${past ? 'opacity-60' : ''}`}
              >
                <span className="flex items-start justify-between">
                  <span className={`text-xs font-bold ${isToday ? 'rounded-full bg-[var(--accent)] px-1.5 text-[var(--accent-ink)]' : 'text-[var(--muted)]'}`}>{Number(d.slice(8))}</span>
                  {deficit && <span aria-label="Shortfall" className="h-2.5 w-2.5 rounded-full bg-[var(--coral)]" />}
                </span>
                <span className="text-base font-bold tabular-nums leading-none">{money(info.total)}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  {shown.map((c) => <Chip key={c.key} chip={c} compact />)}
                  {chips.length > shown.length && <span className="text-[11px] font-semibold text-[var(--muted)]">+{chips.length - shown.length} more</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
