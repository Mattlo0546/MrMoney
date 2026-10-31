'use client';
import { useId, useState } from 'react';
import type { ItineraryPrefs } from '@/lib/itinerary/types';
import { TUBE_LINES } from '@/lib/itinerary/types';
import { Check, Plus, X } from 'lucide-react';

const CUISINES = ['Chinese', 'Italian', 'British', 'Indian', 'Mexican', 'Japanese', 'Thai', 'Korean', 'Middle Eastern', 'Caribbean'];
const DIETS = ['', 'Vegetarian', 'Vegan', 'Pescatarian', 'Halal', 'Gluten-free'];
/** Monday-first display; values are 0 = Sunday … 6 = Saturday. */
const DAYS: { v: number; short: string; long: string }[] = [
  { v: 1, short: 'M', long: 'Monday' }, { v: 2, short: 'T', long: 'Tuesday' }, { v: 3, short: 'W', long: 'Wednesday' },
  { v: 4, short: 'T', long: 'Thursday' }, { v: 5, short: 'F', long: 'Friday' }, { v: 6, short: 'S', long: 'Saturday' }, { v: 0, short: 'S', long: 'Sunday' },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function ToggleChip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold transition-colors ${on ? 'bg-grad-primary shadow-glow' : 'border border-line bg-surface text-muted hover:text-text'}`}>
      {on && <Check aria-hidden="true" size={14} strokeWidth={2.6} />}
      {children}
    </button>
  );
}

function Group({ legend, children, hint }: { legend: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

const inputCls = 'h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent';

export function PrefsForm({ prefs, onChange }: { prefs: ItineraryPrefs; onChange: (p: ItineraryPrefs) => void }) {
  const [want, setWant] = useState('');
  const id = useId();
  const set = <K extends keyof ItineraryPrefs>(k: K, v: ItineraryPrefs[K]) => onChange({ ...prefs, [k]: v });
  const addWant = () => {
    const w = want.trim();
    if (!w) return;
    if (!prefs.wants.some((x) => x.toLowerCase() === w.toLowerCase())) set('wants', [...prefs.wants, w].slice(0, 6));
    setWant('');
  };
  return (
    <div className="flex flex-col gap-5">
      <Group legend="Food you enjoy cooking">
        <div className="flex flex-wrap gap-1.5">
          {CUISINES.map((c) => <ToggleChip key={c} on={prefs.cuisines.includes(c)} onClick={() => set('cuisines', toggle(prefs.cuisines, c))}>{c}</ToggleChip>)}
        </div>
        <label className="mt-1 flex items-center gap-2 text-sm font-semibold" htmlFor={`${id}-diet`}>
          Diet
          <select id={`${id}-diet`} value={prefs.diet ?? ''} onChange={(e) => set('diet', e.target.value || undefined)}
            className="h-11 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent">
            {DIETS.map((d) => <option key={d} value={d}>{d || 'No restrictions'}</option>)}
          </select>
        </label>
      </Group>

      <Group legend="How you get around" hint="Pick the lines you actually use. Fares are looked up for these.">
        <div className="flex flex-wrap gap-1.5">
          {TUBE_LINES.map((l) => <ToggleChip key={l} on={prefs.lines.includes(l)} onClick={() => set('lines', toggle(prefs.lines, l))}>{l.replace(/ line$/, '')}</ToggleChip>)}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-muted" htmlFor={`${id}-home`}>Home station
            <input id={`${id}-home`} className={inputCls} value={prefs.homeStation} onChange={(e) => set('homeStation', e.target.value)} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted" htmlFor={`${id}-campus`}>Campus station
            <input id={`${id}-campus`} className={inputCls} value={prefs.campusStation} onChange={(e) => set('campusStation', e.target.value)} autoComplete="off" />
          </label>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-muted" id={`${id}-days`}>Commute days</p>
          <div role="group" aria-labelledby={`${id}-days`} className="flex gap-1">
            {DAYS.map((d) => (
              <button key={d.v} type="button" aria-pressed={prefs.commuteDays.includes(d.v)} aria-label={d.long}
                onClick={() => set('commuteDays', toggle(prefs.commuteDays, d.v).sort())}
                className={`grid size-11 place-items-center rounded-full text-sm font-bold ${prefs.commuteDays.includes(d.v) ? 'bg-grad-primary shadow-glow' : 'border border-line bg-surface text-muted'}`}>
                {d.short}
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group legend="Things you want this month" hint="Trainers, a gig, a nice dinner out. They get a real price and a day.">
        {prefs.wants.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {prefs.wants.map((w) => (
              <li key={w} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-grad-primary-soft pl-3 text-sm font-bold text-accent">
                {w}
                <button type="button" onClick={() => set('wants', prefs.wants.filter((x) => x !== w))} aria-label={`Remove ${w}`} className="grid size-11 place-items-center rounded-full">
                  <X aria-hidden="true" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`${id}-want`}>Add something you want</label>
          <input id={`${id}-want`} className={inputCls} placeholder="e.g. a ramen dinner out" value={want} onChange={(e) => setWant(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWant(); } }} />
          <button type="button" onClick={addWant} disabled={!want.trim()} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm font-bold disabled:opacity-40">
            <Plus aria-hidden="true" size={15} />Add
          </button>
        </div>
      </Group>

      <Group legend="Treat dinners per week">
        <div role="radiogroup" aria-label="Treat dinners per week" className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={prefs.treatsPerWeek === n} onClick={() => set('treatsPerWeek', n)}
              className={`min-h-10 flex-1 rounded-full text-sm font-bold tabular-nums ${prefs.treatsPerWeek === n ? 'bg-grad-primary shadow-glow' : 'text-muted hover:text-text'}`}>
              {n === 0 ? 'None' : n}
            </button>
          ))}
        </div>
      </Group>
    </div>
  );
}
