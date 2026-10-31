'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import { Composer } from '@/components/plan/composer/Composer';
import { ChangePanel } from '@/components/plan/change/ChangePanel';
import { OffersPanel } from '@/components/plan/offers/OffersPanel';
import { buildPlanData } from '../calendar/data';
import { MonthCalendar } from '../calendar/MonthCalendar';
import { Agenda } from '../calendar/Agenda';
import { playBubbles } from '../calendar/bubble';
import { DayDetail } from '../day/DayDetail';
import { SummaryStrip } from './SummaryStrip';

type Tab = 'day' | 'change' | 'offers';
const TABS: { id: Tab; label: string }[] = [{ id: 'day', label: 'Day' }, { id: 'change', label: 'Change' }, { id: 'offers', label: 'Offers' }];

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(min-width: 1024px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true,
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your plan" className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="h-40 animate-pulse rounded-3xl bg-[var(--surface)]" />
      <div className="h-[560px] animate-pulse rounded-3xl bg-[var(--surface)]" />
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl font-extrabold">No plan yet</h1>
      <p className="text-[var(--muted)]">Answer a few quick questions and we will build your day-by-day plan.</p>
      <Link href="/onboarding" className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-6 font-bold text-[var(--accent-ink)]">Set up my plan</Link>
    </div>
  );
}

function PanelTabs({ tab, setTab, children }: { tab: Tab; setTab: (t: Tab) => void; children: Record<Tab, React.ReactNode> }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Plan panel" className="mb-3 flex gap-1 rounded-full bg-[var(--surface-2)] p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="plan-tabpanel" type="button" onClick={() => setTab(t.id)}
            className={`min-h-11 flex-1 rounded-full text-sm font-bold ${tab === t.id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)]'}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="plan-tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">{children[tab]}</div>
    </div>
  );
}

export function PlanView() {
  const snap = useAppSnapshot();
  const desktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [monthOverride, setMonth] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('day');
  const [sheet, setSheet] = useState(false);
  const [seenChange, setSeenChange] = useState<number | null>(null);

  const { state, today, changeId, changedDays, changedItems } = snap;
  const data = useMemo(() => (state ? buildPlanData(state, today) : null), [state, today]);
  const changed = useMemo(() => new Set(changedItems), [changedItems]);

  // Adjust state while rendering when a new change arrives: Change tab, sheet, and a visible month.
  if (snap.hydrated && seenChange === null) setSeenChange(changeId);
  else if (seenChange !== null && seenChange !== changeId) {
    setSeenChange(changeId);
    if (changedDays.length > 0 || changedItems.length > 0) {
      setTab('change');
      setSheet(true);
      const cur = monthOverride ?? (selected ?? today).slice(0, 7);
      if (changedDays.length && !changedDays.some((d) => d.slice(0, 7) === cur)) setMonth(changedDays[0].slice(0, 7));
    }
  }

  useEffect(() => {
    if (!snap.hydrated || changeId === 0 || !rootRef.current) return;
    if (changedDays.length === 0 && changedItems.length === 0) return;
    playBubbles(rootRef.current, changedDays, changedItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeId]);

  if (!snap.hydrated) return <Skeleton />;
  if (!state || !data) return <Empty />;

  const clamp = (d: ISODate) => (data.days.has(d) ? d : d < data.start ? data.start : data.end);
  const sel = clamp(selected ?? today);
  const month = monthOverride ?? sel.slice(0, 7);
  const info = data.days.get(sel)!;
  const summary = (state.plan ?? null)?.summary;
  const select = (d: ISODate) => { setSelected(d); setTab('day'); if (!desktop) setSheet(true); };
  const deficitBanner = data.undated.length > 0 || data.fundingGap > 0;

  const panels: Record<Tab, React.ReactNode> = {
    day: <DayDetail info={info} today={today} changed={changed} />,
    change: <ChangePanel />,
    offers: <OffersPanel />,
  };

  const banner = deficitBanner && (
    <div role="alert" className="rounded-3xl border border-[var(--coral)] bg-[var(--surface)] p-4">
      <p className="font-bold text-[var(--coral)]">
        {data.fundingGap > 0 ? `Your plan is ${formatMoney(data.fundingGap)} short.` : 'Part of your plan is not fully covered.'}
      </p>
      <ul className="mt-1 list-disc pl-5 text-sm">{data.undated.map((d, i) => <li key={i}>{d.reason}</li>)}</ul>
      <p className="mt-1 text-sm text-[var(--muted)]">Rent and your reserve have not been touched. Tell me what changed and we can find a way through.</p>
    </div>
  );

  if (desktop) {
    return (
      <div ref={rootRef} className="mx-auto flex h-[calc(100dvh-4rem)] min-h-[720px] max-w-[1600px] flex-col gap-4 p-6">
        {summary && <SummaryStrip s={summary} />}
        {banner}
        <div className="flex min-h-0 flex-1 gap-4">
          <MonthCalendar data={data} today={today} month={month} onMonth={setMonth} selected={sel} onSelect={select} changed={changed} />
          <aside aria-label="Assistant and details" className="flex min-h-0 w-[400px] shrink-0 flex-col gap-3 rounded-3xl bg-[var(--surface)] p-4">
            <Composer />
            <PanelTabs tab={tab} setTab={setTab}>{panels}</PanelTabs>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4 p-4 pb-40">
      {summary && <SummaryStrip s={summary} />}
      {banner}
      <Agenda data={data} today={today} selected={sel} onSelect={select} changed={changed} />
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => setSheet(false)}>
          <div role="dialog" aria-label="Plan details" onClick={(e) => e.stopPropagation()} className="flex max-h-[75dvh] min-h-[50dvh] w-full flex-col rounded-t-3xl bg-[var(--surface)] p-4 pb-28">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setSheet(false)} className="min-h-11 rounded-full bg-[var(--surface-2)] px-4 text-sm font-bold">Close</button>
            </div>
            <PanelTabs tab={tab} setTab={setTab}>{panels}</PanelTabs>
          </div>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[var(--surface)] p-3" onFocusCapture={() => setSheet(true)}>
        <Composer compact />
      </div>
    </div>
  );
}
