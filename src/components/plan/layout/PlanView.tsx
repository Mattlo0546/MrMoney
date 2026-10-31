'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { formatMoney } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { playBubble } from '@/components/ui/bubble';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useOpenPreview } from '@/components/chat/chatStore';
import { OffersPanel } from '@/components/plan/offers/OffersPanel';
import { ItineraryPanel } from '@/components/plan/itinerary/ItineraryPanel';
import { isRecentItineraryApply } from '@/components/plan/itinerary/storage';
import { buildPlanData } from '../calendar/data';
import { MonthCalendar } from '../calendar/MonthCalendar';
import { Agenda } from '../calendar/Agenda';
import { playBubbles } from '../calendar/bubble';
import { DayDetail, longDate } from '../day/DayDetail';
import type { ChipSpec, PreviewChips } from '../calendar/shared';
import { SummaryStrip } from './SummaryStrip';
import { CalendarDays, Eye, MessageCircle, Sparkles, Tag, type LucideIcon } from 'lucide-react';
import { IconBadge, WithIcon } from '@/components/ui/Value';

type Tab = 'chat' | 'plan' | 'day' | 'deals';
const TABS: { id: Tab; label: string; icon?: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle }, { id: 'plan', label: 'Spending plan' }, { id: 'day', label: 'Day', icon: CalendarDays }, { id: 'deals', label: 'Deals', icon: Tag },
];

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

/** Sets an element's height to fill the viewport below its top edge (keyboard-aware on mobile). */
function useFillHeight<T extends HTMLElement>(min = 360) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(min, vh - top)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, [min]);
  return ref;
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your plan" className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="h-40 animate-pulse rounded-3xl border border-line bg-surface-2" />
      <div className="h-[560px] animate-pulse rounded-3xl border border-line bg-surface-2" />
    </div>
  );
}

/** First visit: a centred, full-height chat. */
function FirstVisit() {
  const ref = useFillHeight<HTMLDivElement>(480);
  return (
    <div ref={ref} className="flex flex-col px-4 pt-2 lg:pt-6">
      <ChatPanel variant="welcome" autoFocus />
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: LucideIcon }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
      {items.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} id={`tab-${label}-${t.id}`} onClick={() => onChange(t.id)}
          className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-sm font-bold transition-colors ${value === t.id ? 'bg-grad-primary shadow-glow' : 'text-muted hover:text-text'}`}>
          {t.icon && <t.icon aria-hidden="true" size={15} strokeWidth={2.3} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

const ENTER_CSS = `
@keyframes sp-plan-in{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}
@keyframes sp-panel-in{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}
.sp-plan-in{animation:sp-plan-in 520ms cubic-bezier(.34,1.56,.64,1) both}
.sp-panel-in{animation:sp-panel-in 420ms cubic-bezier(.22,1,.36,1) both}
@media (prefers-reduced-motion:reduce){.sp-plan-in,.sp-panel-in{animation:none}}
`;

/** Day-by-day bubble when a plan first appears (staggered ~30ms per day, ~1.2s max). */
function bubbleDays(root: HTMLElement | null) {
  if (!root) return;
  const cells = [...root.querySelectorAll<HTMLElement>('[data-day]')].filter((el) => !el.closest('[aria-hidden="true"]'));
  const uniq = new Map<string, HTMLElement>();
  for (const el of cells) if (!uniq.has(el.dataset.day!)) uniq.set(el.dataset.day!, el);
  const list = [...uniq.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, el]) => el);
  const step = Math.max(12, Math.min(30, 1200 / Math.max(1, list.length)));
  list.forEach((el, i) => window.setTimeout(() => playBubble(el), 260 + i * step));
}

export function PlanView() {
  const snap = useAppSnapshot();
  // Detect "no plan -> plan" inside this session to play the entrance animation.
  const [sawEmpty, setSawEmpty] = useState(false);
  const [enterKey, setEnterKey] = useState(0);
  if (snap.hydrated && !snap.state && !sawEmpty) setSawEmpty(true);
  if (snap.state && sawEmpty) {
    setSawEmpty(false);
    setEnterKey((k) => k + 1);
  }
  if (!snap.hydrated) return <Skeleton />;
  if (!snap.state) return <FirstVisit />;
  return <PlanLayout enterKey={enterKey} />;
}

function PlanLayout({ enterKey }: { enterKey: number }) {
  const snap = useAppSnapshot();
  const desktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [monthOverride, setMonth] = useState<string | null>(null);
  // No spending plan yet: open on it, so the student sees the creative plan first.
  const hasItinerary = !!snap.state?.plannedPurchases.some((p) => p.source === 'itinerary');
  const [tab, setTab] = useState<Tab>(hasItinerary ? 'chat' : 'plan');
  const [mobileView, setMobileView] = useState<'chat' | 'calendar' | 'plan'>(hasItinerary ? 'chat' : 'plan');
  const [daySheet, setDaySheet] = useState(false);
  const [dealsSheet, setDealsSheet] = useState(false);
  const [seenChange, setSeenChange] = useState(snap.changeId);
  const openPreview = useOpenPreview();

  const { state, today, changeId, changedDays, changedItems } = snap;
  const data = useMemo(() => (state ? buildPlanData(state, today) : null), [state, today]);
  const changed = useMemo(() => new Set(changedItems), [changedItems]);

  // A new change: show the chat (where its card is) and bring the changed month into view.
  if (seenChange !== changeId) {
    setSeenChange(changeId);
    // The spending plan panel's own re-plans stay on that panel (the calendar bubbles beside it).
    const fromItinerary = snap.lastDiff?.intentKind === 'itinerary' || isRecentItineraryApply();
    if ((changedDays.length > 0 || changedItems.length > 0) && !fromItinerary) {
      setTab('chat');
      const cur = monthOverride ?? (selected ?? today).slice(0, 7);
      if (changedDays.length && !changedDays.some((d) => d.slice(0, 7) === cur)) setMonth(changedDays[0].slice(0, 7));
    }
  }

  // Un-applied chat preview: outline affected days and add dashed preview chips.
  const { preview, previewDays } = useMemo(() => {
    const chips: PreviewChips = new Map();
    const days = new Set<ISODate>();
    const pv = openPreview?.pv;
    const goal = openPreview?.goal;
    if (goal) {
      const add = (d: ISODate, c: ChipSpec) => chips.set(d, [...(chips.get(d) ?? []), c]);
      for (const c of goal.changes) {
        days.add(c.date);
        if (c.date === goal.date) add(c.date, { key: `pv-goal-${c.date}`, kind: 'preview', label: `🎯 ${goal.label}`, pence: goal.amountPence });
        else if (c.what.startsWith('treats')) add(c.date, { key: `pv-cut-${c.date}`, kind: 'preview', label: 'Saving mode', pence: c.savedPence, negative: true });
        else add(c.date, { key: `pv-fund-${c.date}`, kind: 'preview', label: `${goal.label} fund`, pence: c.savedPence });
      }
    } else if (openPreview && pv) {
      const intent = openPreview.intent;
      const add = (d: ISODate, c: ChipSpec) => chips.set(d, [...(chips.get(d) ?? []), c]);
      if (intent.kind === 'hypothetical') {
        days.add(intent.date);
        add(intent.date, { key: `pv-${intent.date}`, kind: 'preview', label: intent.label ?? intent.category, pence: intent.amount.pence });
      }
      if (pv.ok) {
        for (const d of pv.diff.changedDays) days.add(d);
        const perDay = new Map<ISODate, number>();
        for (const c of pv.diff.cellChanges) {
          if (c.field !== 'planned' || (intent.kind === 'hypothetical' && c.day === intent.date)) continue;
          perDay.set(c.day, (perDay.get(c.day) ?? 0) + (c.from.pence - c.to.pence));
        }
        for (const [d, delta] of perDay) {
          if (delta !== 0) add(d, { key: `pv-adj-${d}`, kind: 'preview', label: 'Adjusted', pence: Math.abs(delta), negative: delta > 0 });
        }
      }
    }
    return { preview: chips, previewDays: days };
  }, [openPreview]);

  // Bring a newly previewed day into view (adjust state while rendering, once per preview).
  const firstPreviewDay = useMemo(() => [...previewDays].sort()[0], [previewDays]);
  const [seenPreviewDay, setSeenPreviewDay] = useState<ISODate | undefined>(undefined);
  if (firstPreviewDay !== seenPreviewDay) {
    setSeenPreviewDay(firstPreviewDay);
    if (firstPreviewDay) setMonth(firstPreviewDay.slice(0, 7));
  }

  // A new preview: ripple across the days it would change, so the calendar visibly reacts before Apply.
  const previewKey = openPreview?.id;
  useEffect(() => {
    if (!previewKey || !previewDays.size) return;
    // Wait a frame for the month switch and the preview chips to render.
    const t = window.setTimeout(() => rootRef.current && playBubbles(rootRef.current, [...previewDays], [], 70), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // Bubble changed days/chips (and the compact today strip on mobile).
  useEffect(() => {
    if (!snap.hydrated || changeId === 0) return;
    if (changedDays.length === 0 && changedItems.length === 0) return;
    // Multi-day re-plans ripple day by day; single changes keep the quick bubble.
    if (rootRef.current) playBubbles(rootRef.current, changedDays, changedItems, changedDays.length > 3 ? 70 : undefined);
    if (stripRef.current) playBubble(stripRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeId]);

  // Entrance: calendar slides in, then days bubble one by one.
  useEffect(() => {
    if (enterKey === 0) return;
    const t = window.setTimeout(() => bubbleDays(rootRef.current), 120);
    return () => window.clearTimeout(t);
  }, [enterKey]);

  const mobileFill = useFillHeight<HTMLDivElement>(420);
  const asideFill = useFillHeight<HTMLElement>(560);

  if (!state || !data) return null;

  const clamp = (d: ISODate) => (data.days.has(d) ? d : d < data.start ? data.start : data.end);
  const sel = clamp(selected ?? today);
  const month = monthOverride ?? sel.slice(0, 7);
  const info = data.days.get(sel)!;
  const summary = state.plan?.summary;
  const upcoming = state.incomes.filter((i) => i.confirmed && i.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextIncome = upcoming ? { date: upcoming.date, pence: upcoming.amount.pence } : null;
  const todayPlanned = data.days.get(today)?.purchases.reduce((a, p) => a + p.pence, 0) ?? 0;
  const select = (d: ISODate) => {
    setSelected(d);
    if (desktop) setTab('day');
    else setDaySheet(true);
  };
  const deficitBanner = data.undated.length > 0 || data.fundingGap > 0;
  const entering = enterKey > 0;

  const banner = deficitBanner && (
    <div role="alert" className="flex gap-3 rounded-3xl border border-neg/25 bg-grad-negative-soft p-4">
      <IconBadge icon="shortfall" tone="negative" size="md" solid />
      <div className="min-w-0">
        <p className="font-bold text-neg">
          {data.fundingGap > 0 ? `Your plan is ${formatMoney(data.fundingGap)} short.` : 'Part of your plan is not fully covered.'}
        </p>
        <ul className="mt-1 list-disc pl-5 text-sm">{data.undated.map((d, i) => <li key={i}>{d.reason}</li>)}</ul>
        <p className="mt-1 text-sm text-muted">Rent and your reserve have not been touched. Tell me what changed and we can find a way through.</p>
      </div>
    </div>
  );

  if (desktop) {
    return (
      <div className="mx-auto flex max-w-[1600px] items-start gap-4 p-6">
        <style dangerouslySetInnerHTML={{ __html: ENTER_CSS }} />
        <div ref={rootRef} key={`plan-${enterKey}`} className={`flex min-w-0 flex-1 flex-col gap-4 ${entering ? 'sp-plan-in' : ''}`}>
          {summary && <SummaryStrip s={summary} today={today} nextIncome={nextIncome} todayPlanned={todayPlanned} />}
          {banner}
          <MonthCalendar data={data} today={today} month={month} onMonth={setMonth} selected={sel} onSelect={select} preview={preview} previewDays={previewDays} />
        </div>
        <aside ref={asideFill} aria-label="Assistant" className={`sticky top-[72px] flex max-h-[calc(100dvh-88px)] w-[420px] shrink-0 flex-col rounded-3xl border border-line bg-surface p-4 shadow-card ${entering ? 'sp-panel-in' : ''}`}>
          <div className="flex min-h-0 flex-1 flex-col" hidden={tab !== 'chat'} style={tab !== 'chat' ? { display: 'none' } : undefined}>
            <ChatPanel variant="panel" autoFocus={entering} header={<Segmented label="panel" value={tab} onChange={setTab} items={TABS} />} />
          </div>
          {tab !== 'chat' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-3"><Segmented label="panel" value={tab} onChange={setTab} items={TABS} /></div>
              <div role="tabpanel" aria-labelledby={`tab-panel-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
                {tab === 'day' ? <DayDetail info={info} today={today} changed={changed} /> : tab === 'plan' ? <ItineraryPanel /> : <OffersPanel />}
              </div>
            </div>
          )}
        </aside>
      </div>
    );
  }

  const s = summary;
  return (
    <div className="flex flex-col px-4 pt-3">
      <style dangerouslySetInnerHTML={{ __html: ENTER_CSS }} />
      {s && (
        <div ref={stripRef} data-testid="today-strip" className="flex items-center gap-3 rounded-3xl bg-grad-hero px-4 py-3 shadow-glow">
          <IconBadge icon="allowance" tone="onGradient" size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">Left today</p>
            <p className="font-display text-3xl font-extrabold leading-none tabular-nums">{formatMoney(s.todayRemaining)}</p>
          </div>
          <div className="text-right text-xs font-bold">
            <p>Flexible left</p>
            <p className="text-base tabular-nums"><WithIcon icon="flexible" tone="onGradient" size={14}>{formatMoney(s.flexibleRemaining)}</WithIcon></p>
          </div>
        </div>
      )}
      <div className="mt-3">
        <Segmented label="view" value={mobileView} onChange={setMobileView} items={[{ id: 'chat', label: 'Chat', icon: MessageCircle }, { id: 'plan', label: 'Spending plan', icon: Sparkles }, { id: 'calendar', label: 'Calendar', icon: CalendarDays }]} />
      </div>
      {mobileView === 'chat' ? (
        <div ref={mobileFill} className="flex min-h-0 flex-col pb-3 pt-3">
          <ChatPanel variant="panel" autoFocus={false} onShowDeals={() => setDealsSheet(true)} header={<p className="text-sm font-bold text-muted">{snap.demoActive ? 'Demo student' : 'Your assistant'}</p>} />
        </div>
      ) : mobileView === 'plan' ? (
        <div className="pb-10 pt-3"><ItineraryPanel onShowCalendar={() => setMobileView('calendar')} /></div>
      ) : (
        <div ref={rootRef} className={`flex flex-col gap-4 pb-10 pt-3 ${entering ? 'sp-plan-in' : ''}`}>
          {s && <SummaryStrip s={s} today={today} nextIncome={nextIncome} todayPlanned={todayPlanned} />}
          {banner}
          {openPreview && (
            <button type="button" onClick={() => setMobileView('chat')} className="flex items-center gap-2 rounded-3xl border border-dashed border-accent-2 bg-accent-soft p-3 text-left text-sm font-bold text-accent">
              <Eye aria-hidden="true" size={16} className="shrink-0" />
              A preview is waiting in the chat. Tap to Apply or Discard.
            </button>
          )}
          <Agenda data={data} today={today} selected={sel} onSelect={select} preview={preview} previewDays={previewDays} />
          <button type="button" onClick={() => setDealsSheet(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-bold shadow-soft"><Tag aria-hidden="true" size={16} className="text-accent" />See deals</button>
        </div>
      )}
      <Sheet open={daySheet} onClose={() => setDaySheet(false)} title={longDate(sel)}>
        <DayDetail info={info} today={today} changed={changed} />
      </Sheet>
      <Sheet open={dealsSheet} onClose={() => setDealsSheet(false)} title="Deals">
        <OffersPanel />
      </Sheet>
    </div>
  );
}
