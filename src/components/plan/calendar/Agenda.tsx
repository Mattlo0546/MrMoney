'use client';
import { addDays, dayOfWeek } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import type { PlanData } from './data';
import { Chip, chipsFor, money } from './shared';
import type { PreviewChips } from './shared';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Agenda({ data, today, selected, onSelect, preview, previewDays }: {
  data: PlanData; today: ISODate; selected: ISODate; onSelect: (d: ISODate) => void; preview: PreviewChips; previewDays: Set<ISODate>;
}) {
  // Weeks start Monday; show the week containing today onward (past days live in the calendar view).
  const weekStart = (d: ISODate) => addDays(d, -((dayOfWeek(d) + 6) % 7));
  const weeks: { start: ISODate; days: ISODate[] }[] = [];
  let ws = weekStart(today < data.start ? data.start : today);
  while (ws <= data.end) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => data.days.get(d)?.inPlan && d >= today);
    if (days.length) weeks.push({ start: ws, days });
    ws = addDays(ws, 7);
  }
  return (
    <div className="flex flex-col gap-6">
      {weeks.map((w) => (
        <section key={w.start} aria-label={`Week of ${w.start}`}>
          <h3 className="mb-2 text-sm font-bold text-[var(--muted)]">Week of {Number(w.start.slice(8))} {MON[Number(w.start.slice(5, 7)) - 1]}</h3>
          <ul className="flex flex-col gap-2">
            {w.days.map((d) => {
              const info = data.days.get(d)!;
              const chips = chipsFor(info, preview.get(d));
              const dt = d === today;
              return (
                <li key={d}>
                  <button type="button" data-day={d} data-preview={previewDays.has(d) || undefined} onClick={() => onSelect(d)}
                    className={`flex min-h-14 w-full flex-col gap-2 rounded-3xl bg-[var(--surface)] p-4 text-left ${previewDays.has(d) ? 'border-2 border-dashed border-[var(--lime)]' : ''} ${dt ? 'ring-2 ring-[var(--accent)]' : d === selected ? 'ring-1 ring-[var(--line)]' : ''}`}>
                    <span className="flex items-center gap-2">
                      {info.deficits.length > 0 && <span aria-label="Shortfall" className="h-2.5 w-2.5 rounded-full bg-[var(--coral)]" />}
                      <span className="font-bold">{DOW[dayOfWeek(d)]} {Number(d.slice(8))}{dt ? ' · Today' : ''}</span>
                      <span className="font-display ml-auto text-xl font-extrabold tabular-nums">{money(info.total)}</span>
                    </span>
                    {chips.length > 0 && <span className="flex flex-wrap gap-1.5">{chips.map((c) => <Chip key={c.key} chip={c} />)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
