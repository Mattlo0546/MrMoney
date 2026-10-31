'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayOfWeek, daysInMonth } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import type { PlanData } from './data';
import { Chip, PinIcon, chipsFor, money } from './shared';
import type { PreviewChips } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ymOf = (d: ISODate) => d.slice(0, 7);
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const mondayOf = (d: ISODate) => addDays(d, -((dayOfWeek(d) + 6) % 7));

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
      <li className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--navy)] px-2 py-0.5 text-white"><PinIcon className="h-2.5 w-2.5" />Bill</li>
      <li className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[var(--accent-ink)]">Spent</li>
      <li className="rounded-full bg-[var(--lime)] px-2 py-0.5 text-[#0B0C1F]">Income</li>
      <li className="rounded-full border border-dashed border-[var(--lime)] px-2 py-0.5 text-[var(--lime)]">Preview</li>
    </ul>
  );
}

export function MonthCalendar({
  data, today, month, onMonth, selected, onSelect, preview, previewDays,
}: {
  data: PlanData; today: ISODate; month: string; onMonth: (ym: string) => void;
  selected: ISODate; onSelect: (d: ISODate) => void; preview: PreviewChips; previewDays: Set<ISODate>;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const [cursorRaw, setCursor] = useState<ISODate>(selected);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01` as ISODate;
  const weeks = useMemo(() => {
    const start = mondayOf(first);
    const count = Math.ceil(((dayOfWeek(first) + 6) % 7 + daysInMonth(y, m)) / 7);
    return Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }, [first, y, m]);
  const months = useMemo(() => {
    const out: string[] = [];
    for (let ym = data.minMonth; ym <= data.maxMonth && out.length < 60; ym = shiftMonth(ym, 1)) out.push(ym);
    if (!out.includes(month)) out.push(month);
    return out.sort();
  }, [data.minMonth, data.maxMonth, month]);
  const canPrev = shiftMonth(month, -1) >= data.minMonth;
  const canNext = shiftMonth(month, 1) <= data.maxMonth;
  const inGrid = (d: ISODate) => weeks.some((w) => w.includes(d));
  const cursor = inGrid(cursorRaw) && data.days.has(cursorRaw) ? cursorRaw : selected && inGrid(selected) ? selected : first;

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
  }, [cursor, month]);

  const move = (next: ISODate) => {
    if (!data.days.has(next)) return;
    if (ymOf(next) < data.minMonth || ymOf(next) > data.maxMonth) return;
    focusNext.current = true;
    setCursor(next);
    if (ymOf(next) !== month) onMonth(ymOf(next));
  };
  const monthStep = (d: ISODate, n: number): ISODate => {
    const ym = shiftMonth(ymOf(d), n);
    const [yy, mm] = ym.split('-').map(Number);
    return `${ym}-${String(Math.min(Number(d.slice(8)), daysInMonth(yy, mm))).padStart(2, '0')}`;
  };
  const onKey = (e: React.KeyboardEvent, d: ISODate) => {
    let next: ISODate | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(d, -1); break;
      case 'ArrowRight': next = addDays(d, 1); break;
      case 'ArrowUp': next = addDays(d, -7); break;
      case 'ArrowDown': next = addDays(d, 7); break;
      case 'Home': next = mondayOf(d); break;
      case 'End': next = addDays(mondayOf(d), 6); break;
      case 'PageUp': next = monthStep(d, -1); break;
      case 'PageDown': next = monthStep(d, 1); break;
      case 'Enter': case ' ': e.preventDefault(); onSelect(d); return;
      default: return;
    }
    e.preventDefault();
    move(next);
  };

  return (
    <section aria-label="Month calendar" className="flex min-w-0 flex-1 flex-col rounded-3xl bg-[var(--surface)] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative mr-2 inline-flex items-center">
          <span className="sr-only">Month</span>
          {/* TODO(reui): replace the native select with the ReUI dropdown composition. */}
          <select
            value={month}
            onChange={(e) => onMonth(e.target.value)}
            className="font-display min-h-11 cursor-pointer appearance-none rounded-full bg-transparent py-0 pr-8 text-2xl font-extrabold text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {months.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-2 text-[var(--muted)]">⌄</span>
        </label>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => onMonth(shiftMonth(month, -1))} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40">‹</button>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => onMonth(shiftMonth(month, 1))} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40">›</button>
        <button type="button" className="min-h-11 rounded-full bg-[var(--surface-2)] px-4 text-sm font-bold" onClick={() => { onMonth(ymOf(today)); onSelect(today); setCursor(today); }}>Today</button>
        <div className="ml-auto"><Legend /></div>
      </div>
      <div ref={gridRef} role="grid" aria-label={monthLabel(month)} className="flex flex-col gap-1.5">
        <div role="row" className="grid grid-cols-7 gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="px-2">{w}</div>)}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const info = data.days.get(d);
              if (!info) return <div key={d} role="gridcell" aria-hidden className="min-h-[92px] rounded-2xl border border-[var(--line)] opacity-30" />;
              const chips = chipsFor(info, preview.get(d));
              const shown = chips.slice(0, 2);
              const isToday = d === today;
              const past = d < today;
              const outside = ymOf(d) !== month;
              const deficit = info.deficits.length > 0;
              const sel = d === selected;
              const pv = previewDays.has(d);
              const showTotal = info.inPlan && !past;
              return (
                <div key={d} role="gridcell" aria-selected={sel} className="min-w-0">
                  <button
                    type="button"
                    data-day={d}
                    data-preview={pv || undefined}
                    tabIndex={d === cursor ? 0 : -1}
                    aria-label={`${d}${showTotal ? `, planned ${money(info.total)}` : ''}${chips.length ? `, ${chips.length} item${chips.length > 1 ? 's' : ''}` : ''}${deficit ? ', shortfall' : ''}${isToday ? ', today' : ''}${pv ? ', preview' : ''}`}
                    onClick={() => { setCursor(d); onSelect(d); }}
                    onKeyDown={(e) => onKey(e, d)}
                    className={`relative flex min-h-[92px] w-full flex-col gap-1 rounded-2xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      pv ? 'border-dashed border-[var(--lime)] bg-[var(--surface-2)]' : sel ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--surface-2)]'
                    } ${pv ? 'border-2' : ''} ${past ? 'opacity-60' : ''} ${outside && !pv ? 'opacity-70' : ''}`}
                  >
                    <span className="flex items-start justify-between">
                      <span className={`text-sm font-bold ${isToday ? 'rounded-full bg-[var(--accent)] px-2 text-[var(--accent-ink)]' : outside || past ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>{Number(d.slice(8))}</span>
                      {deficit && <span aria-label="Shortfall" className="h-2.5 w-2.5 rounded-full bg-[var(--coral)]" />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {shown.map((c) => <Chip key={c.key} chip={c} compact />)}
                      {chips.length > shown.length && <span className="text-[11px] font-semibold text-[var(--muted)]">+{chips.length - shown.length} more</span>}
                    </span>
                    {showTotal && <span className="mt-auto text-base font-bold tabular-nums leading-none">{money(info.total)}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
