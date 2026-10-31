'use client';
import { useMemo } from 'react';
import { formatMoney, formatShortDate, occurrences } from '@/lib/engine';
import type { EngineState, ISODate } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import type { Catalog, ItineraryPrefs, Question } from '@/lib/itinerary/types';
import { IconBadge, WithIcon } from '@/components/ui/Value';
import { BUCKET_ICON, BUCKET_LABEL } from '../calendar/shared';
import { PrefsForm } from './PrefsForm';
import {
  answerItineraryQuestion,
  buildItinerary,
  replanItinerary,
  resetItineraryToEven,
  setItineraryEditing,
  updateItineraryStore,
  useItineraryUi,
  type ItineraryStore,
} from './storage';
import { CalendarDays, ChevronDown, Globe, LoaderCircle, RotateCcw, Shuffle, Sparkles, type LucideIcon } from 'lucide-react';

type BucketKey = 'groceries' | 'transport' | 'eatingOut' | 'shopping';
const BUCKETS: BucketKey[] = ['groceries', 'transport', 'eatingOut', 'shopping'];

/** Friendly, specific progress copy while the grounded research runs (~10–25s). */
function progressSteps(p: ItineraryPrefs): string[] {
  const lines = p.lines.filter((l) => l !== 'Bus');
  const out = ["Checking Tesco & Sainsbury's prices…"];
  if (lines.length) out.push(`Looking up TfL fares on the ${lines.slice(0, 2).join(' & ')}…`);
  else if (p.lines.includes('Bus')) out.push('Looking up TfL bus fares…');
  if (p.cuisines.length) out.push(`Finding ${p.cuisines.slice(0, 2).join(' & ')} recipes that fit your budget…`);
  out.push('Pricing oils, sauces and spices you only buy once…');
  if (p.wants.length) out.push(`Finding a good price for ${p.wants[0]}…`);
  if (p.treatsPerWeek > 0) out.push('Saving treat dinners for Fridays and paydays…');
  out.push('Spreading it across your days…');
  return out;
}

const BUTTONS: Record<Question['kind'], [yes: string, no: string]> = {
  owned: ['Yes, I have it', 'No'],
  likeRecipe: ['Love it', 'Not for me'],
  keepWant: ['Keep it', 'Drop it'],
};

/** Bills are one-off monthly payments: listed here once, never on the daily calendar. */
function upcomingBills(state: EngineState, today: ISODate) {
  const end = state.profile.horizonEnd;
  const out: { id: string; name: string; date: ISODate; pence: number }[] = [];
  for (const c of state.commitments) {
    const next = occurrences(c, today, end)[0];
    if (next) out.push({ id: c.id, name: next.name, date: next.date, pence: next.pence });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function ItineraryPanel({ onShowCalendar }: { onShowCalendar?: () => void }) {
  const snap = useAppSnapshot();
  const { state, today } = snap;
  const { store, phase, error, step, editing } = useItineraryUi();

  const applied = !!state?.plannedPurchases.some((p) => p.source === 'itinerary');
  const steps = useMemo(() => progressSteps(store.prefs), [store.prefs]);
  const bills = useMemo(() => (state ? upcomingBills(state, today) : []), [state, today]);

  const update = updateItineraryStore;
  const replan = replanItinerary;
  const build = () => {
    void buildItinerary();
  };
  const answer = answerItineraryQuestion;
  const resetToEven = resetItineraryToEven;
  const setEditing = setItineraryEditing;

  const res = applied ? store.result : null;
  const questions = (res?.questions ?? []).filter((q) => !store.answered.includes(q.id));
  const showForm = editing || !res;
  const loading = phase === 'loading';

  return (
    <div className="flex flex-col gap-4">
      {res && store.catalog && (
        <PlanSummary res={res} catalog={store.catalog} onShowCalendar={onShowCalendar}
          onShuffle={() => store.catalog && replan({ ...store, seed: store.seed + 1 }, store.catalog)} onReset={resetToEven} />
      )}

      {!applied && store.result && store.catalog && !loading && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <span className="flex-1">Your last spending plan is saved but not on the calendar.</span>
          <button type="button" onClick={() => store.catalog && replan(store, store.catalog)} className="min-h-11 rounded-full bg-grad-primary px-4 font-bold shadow-glow">Put it back</button>
        </div>
      )}

      {questions.length > 0 && (
        <section aria-label="Quick questions" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted">Quick questions <span className="font-normal">· answers re-plan instantly</span></h3>
          <ul className="flex flex-col gap-2">
            {questions.slice(0, 5).map((q) => (
              <li key={q.id} className="rounded-2xl border border-line bg-surface p-3 shadow-soft">
                <p className="text-sm font-semibold">{q.text}</p>
                {q.savingPence ? <p className="mt-0.5 text-xs font-bold text-pos"><WithIcon icon="savings" tone="positive" size={12}>Could save {formatMoney(q.savingPence)}</WithIcon></p> : null}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => answer(q, true)} className="min-h-11 flex-1 rounded-full bg-grad-primary px-3 text-sm font-bold shadow-glow">{BUTTONS[q.kind][0]}</button>
                  <button type="button" onClick={() => answer(q, false)} className="min-h-11 flex-1 rounded-full border border-line bg-surface px-3 text-sm font-bold">{BUTTONS[q.kind][1]}</button>
                </div>
              </li>
            ))}
          </ul>
          {questions.length > 5 && <p className="text-xs text-muted">{questions.length - 5} more after these.</p>}
        </section>
      )}

      {res && (
        <button type="button" aria-expanded={showForm} onClick={() => setEditing((e) => !e)}
          className="inline-flex min-h-11 items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm font-bold">
          Edit preferences
          <ChevronDown aria-hidden="true" size={16} className={`transition-transform ${showForm ? 'rotate-180' : ''}`} />
        </button>
      )}

      {showForm && (
        <section aria-label="Your preferences" className="rounded-3xl border border-line bg-surface p-4 shadow-soft">
          <PrefsForm prefs={store.prefs} onChange={(prefs) => update({ ...store, prefs })} />
        </section>
      )}

      {(showForm || loading) && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={build} disabled={loading || !state}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-grad-primary px-5 font-bold shadow-glow disabled:opacity-60">
            {loading ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : <Sparkles aria-hidden="true" size={18} />}
            {loading ? 'Building your plan…' : res ? 'Rebuild my plan' : 'Build my plan'}
          </button>
          <p aria-live="polite" className="min-h-5 text-center text-sm text-muted">{loading ? steps[step % steps.length] : ''}</p>
        </div>
      )}

      {error && <p role="alert" className="rounded-2xl border border-neg/25 bg-grad-negative-soft p-3 text-sm font-semibold">{error}</p>}

      {bills.length > 0 && (
        <section aria-label="Monthly bills, paid separately" className="rounded-2xl border border-line p-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted"><IconBadge icon="bills" tone="warning" size="xs" />Monthly bills (paid separately)</h3>
          <p className="mb-2 text-xs text-muted">Already set aside. They never come out of your daily plan.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{b.name}</span>
                <span className="text-xs text-muted"><WithIcon icon="date" tone="neutral" size={12}>{formatShortDate(b.date)}</WithIcon></span>
                <WithIcon icon="bills" tone="warning" size={13} className="w-24 justify-end font-bold tabular-nums">{formatMoney(b.pence)}</WithIcon>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanSummary({ res, catalog, onShowCalendar, onShuffle, onReset }: {
  res: NonNullable<ItineraryStore['result']>; catalog: Catalog; onShowCalendar?: () => void; onShuffle: () => void; onReset: () => void;
}) {
  const total = Math.max(1, res.totalPence);
  return (
    <section aria-label="Plan summary" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        {catalog.live && (
          <span className="inline-flex items-center gap-1 rounded-full bg-grad-positive px-2.5 py-1 text-xs font-bold"><Globe aria-hidden="true" size={12} />Live prices via Google Search</span>
        )}
        <span className="text-xs text-muted"><WithIcon icon="checked" tone="neutral" size={12}>Checked {formatShortDate(catalog.generatedAt.slice(0, 10))}</WithIcon></span>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-grad-primary-soft p-3">
          <dt className="text-xs font-bold text-muted"><WithIcon icon="planned" tone="primary" size={12}>Planned</WithIcon></dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(res.totalPence)}</dd>
        </div>
        <div className="rounded-2xl bg-grad-positive-soft p-3">
          <dt className="text-xs font-bold text-muted"><WithIcon icon="reserve" tone="positive" size={12}>Buffer</WithIcon></dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(Math.max(0, res.leftoverPence))}</dd>
        </div>
      </dl>
      <ul aria-label="By kind" className="flex flex-col gap-1.5">
        {BUCKETS.map((b) => {
          const Icon: LucideIcon = BUCKET_ICON[b];
          const v = res.byBucket[b] ?? 0;
          return (
            <li key={b} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 text-sm">
              <Icon aria-hidden="true" size={15} strokeWidth={2.3} className="text-accent" />
              <span className="font-semibold">{BUCKET_LABEL[b]}</span>
              <span className="font-bold tabular-nums">{formatMoney(v)}</span>
              <span aria-hidden="true" className="col-span-3 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-grad-primary" style={{ width: `${Math.round((v / total) * 100)}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {res.notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">{res.notes.map((n, i) => <li key={i} className="flex gap-1.5"><Sparkles aria-hidden="true" size={12} className="mt-0.5 shrink-0 text-accent" />{n}</li>)}</ul>
      )}
      <div className="flex flex-wrap gap-2">
        {onShowCalendar && (
          <button type="button" onClick={onShowCalendar} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-grad-primary px-4 text-sm font-bold shadow-glow"><CalendarDays aria-hidden="true" size={15} />See it on the calendar</button>
        )}
        <button type="button" onClick={onShuffle} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold"><Shuffle aria-hidden="true" size={15} />Shuffle recipes</button>
        <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold text-muted"><RotateCcw aria-hidden="true" size={15} />Even split instead</button>
      </div>
    </section>
  );
}
