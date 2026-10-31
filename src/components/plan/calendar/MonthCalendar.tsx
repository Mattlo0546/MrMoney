'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayOfWeek, daysInMonth } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import type { PlanData } from './data';
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Layers, Tag, TriangleAlert, Wallet } from 'lucide-react';
import { BUCKET_ICON, BUCKET_LABEL, CHIP_ICON, CHIP_STYLE, Chip, chipsFor, dayHint, money, stripPrefix } from './shared';
import type { ChipKind } from './shared';
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

const LEGEND: { kind: ChipKind; label: string }[] = [
  { kind: 'planned', label: 'Planned' }, { kind: 'actual', label: 'Spent' }, { kind: 'income', label: 'Income' }, { kind: 'preview', label: 'Preview' },
];

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      {LEGEND.map(({ kind, label }) => {
        const Icon = CHIP_ICON[kind];
        return <li key={kind} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${CHIP_STYLE[kind]}`}><Icon aria-hidden="true" className="size-2" strokeWidth={2.5} />{label}</li>;
      })}
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
    <section aria-label="Month calendar" className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-3 lg:p-3.5 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label className="relative mr-1 inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-[10px] bg-grad-primary shadow-glow"><CalendarDays size={16} strokeWidth={2.2} /></span>
          <span className="sr-only">Month</span>
          {/* TODO(reui): replace the native select with the ReUI dropdown composition. */}
          <select
            value={month}
            onChange={(e) => onMonth(e.target.value)}
            className="font-display min-h-8 cursor-pointer appearance-none rounded-full bg-transparent py-0 pr-7 text-lg lg:text-xl font-extrabold text-text outline-none"
          >
            {months.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <ChevronDown aria-hidden="true" size={15} className="pointer-events-none absolute right-1.5 text-muted" />
        </label>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => onMonth(shiftMonth(month, -1))} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-text shadow-soft hover:bg-surface-2 disabled:opacity-40"><ChevronLeft aria-hidden="true" size={15} /></button>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => onMonth(shiftMonth(month, 1))} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-text shadow-soft hover:bg-surface-2 disabled:opacity-40"><ChevronRight aria-hidden="true" size={15} /></button>
        <button type="button" className="min-h-8 rounded-full border border-line bg-surface px-3 text-xs font-bold shadow-soft hover:bg-surface-2" onClick={() => { onMonth(ymOf(today)); onSelect(today); setCursor(today); }}>Today</button>
        <div className="ml-auto"><Legend /></div>
      </div>
      <div ref={gridRef} role="grid" aria-label={monthLabel(month)} className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7 gap-1 text-[11px] font-bold uppercase tracking-wide text-muted">
          {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="px-1.5">{w}</div>)}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const info = data.days.get(d);
              if (!info) return <div key={d} role="gridcell" aria-hidden className="min-h-[58px] lg:min-h-[62px] rounded-xl border border-line opacity-40" />;
              const chips = chipsFor(info, preview.get(d));
              const isToday = d === today;
              const past = d < today;
              const hint = info.inPlan && !past ? dayHint(info) : { buckets: [], headline: null };
              const shown = chips.slice(0, hint.headline ? 1 : 2);
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
                    aria-label={`${d}${showTotal ? `, planned ${money(info.total)}` : ''}${info.savedPence > 0 ? `, discounted by ${money(info.savedPence)}` : ''}${hint.headline ? `, ${hint.buckets.map((b) => BUCKET_LABEL[b]).join(', ')}: ${hint.headline.label}` : ''}${chips.length ? `, ${chips.length} item${chips.length > 1 ? 's' : ''}` : ''}${deficit ? ', shortfall' : ''}${isToday ? ', today' : ''}${pv ? ', preview' : ''}`}
                    onClick={() => { setCursor(d); onSelect(d); }}
                    onKeyDown={(e) => onKey(e, d)}
                    className={`relative flex min-h-[58px] lg:min-h-[62px] w-full flex-col gap-0.5 rounded-xl border p-1.5 text-left transition-colors outline-none ${
                      pv ? 'border-dashed border-accent-2 bg-accent-soft' : sel ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                    } ${pv ? 'border-2' : ''} ${past ? 'opacity-55' : ''} ${outside && !pv ? 'opacity-70' : ''}`}
                  >
                    <span className="flex items-start justify-between gap-1">
                      <span className={`text-xs font-bold ${isToday ? 'rounded-full bg-grad-primary px-1.5 shadow-glow' : outside || past ? 'text-muted' : 'text-text'}`}>{Number(d.slice(8))}</span>
                      <span className="flex items-center gap-1">
                        {info.savedPence > 0 && (
                          <span
                            title={info.dealLabels.length ? `Student deal: ${info.dealLabels.join(', ')}` : 'Student deal applied'}
                            className="inline-flex items-center gap-0.5 rounded-full bg-grad-positive px-1 py-0.5 text-[9px] font-bold leading-none text-white"
                          >
                            <Tag aria-hidden="true" size={8} strokeWidth={2.6} />-{money(info.savedPence)}
                          </span>
                        )}
                        {deficit && <span role="img" aria-label="Shortfall" className="grid size-3.5 place-items-center rounded-full bg-grad-negative"><TriangleAlert aria-hidden="true" size={8} strokeWidth={2.8} /></span>}
                      </span>
                    </span>
                    {hint.headline && (
                      <span aria-hidden="true" title={hint.headline.label} className="flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight text-muted">
                        <span className="flex shrink-0 items-center gap-0.5 text-accent">
                          {hint.buckets.slice(0, 3).map((b) => { const I = BUCKET_ICON[b]; return <I key={b} size={10} strokeWidth={2.4} />; })}
                        </span>
                        <span className="min-w-0 truncate">{stripPrefix(hint.headline.label)}</span>
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {shown.map((c) => <Chip key={c.key} chip={c} compact />)}
                      {chips.length > shown.length && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted"><Layers aria-hidden="true" size={9} strokeWidth={2.5} />+{chips.length - shown.length} more</span>}
                    </span>
                    {showTotal && (
                      <span className="mt-auto inline-flex flex-wrap items-baseline gap-1 text-xs lg:text-sm font-bold tabular-nums leading-none">
                        <Wallet aria-hidden="true" size={11} strokeWidth={2.4} className={`shrink-0 ${info.savedPence > 0 ? 'text-pos' : 'text-accent'}`} />
                        <span className={info.savedPence > 0 ? 'text-pos' : ''}>{money(info.total)}</span>
                        {info.savedPence > 0 && (
                          <span className="text-[10px] font-semibold text-muted line-through">{money(info.originalTotal)}</span>
                        )}
                      </span>
                    )}
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
