'use client';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/engine';
import type { ChangeSet, CategoryMove, Explanation, Intent, Money, Summary } from '@/lib/engine';
import type { ParseSource } from '@/lib/parser/types';
import type { PreviewData } from './changeState';
import { dayLabel } from './format';


/*
 * Standalone, prop-driven result cards (no dependency on changeState's store). Reusable inside chat messages.
 * Wrap in an element with class "spc" and render <MotionStyles /> once (ChangePanel does this).
 */

export function SourceBadge({ source }: { source: ParseSource }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-(--c-line) px-3 py-1 text-xs font-semibold text-(--c-muted)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" /></svg>
      {source === 'gemini' ? 'Read by Gemini' : 'Demo parsing'}
    </span>
  );
}

export function UserBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] rounded-[20px] rounded-br-md bg-(--c-accent) px-4 py-3 text-base font-semibold leading-snug text-(--c-accent-ink)">{text}</p>
    </div>
  );
}

export function kindLabel(intent: Intent): string {
  switch (intent.kind) {
    case 'expense': return 'Expense';
    case 'income': return 'Income';
    case 'hypothetical': return 'Planned';
    case 'preference': return 'Keep available';
    case 'goal': return 'Savings goal';
    case 'commitmentChange': return 'Bill change';
    default: return 'Settings';
  }
}

/** "£35 · Household · Tue 10 Nov" — the muted detail line under the pill. */
export function actionLine(intent: Intent, diff: ChangeSet | null): string {
  const t = diff?.target;
  const amt = diff?.amount ?? ('amount' in intent ? intent.amount : undefined);
  const parts: string[] = [];
  if (amt) parts.push(formatMoney(amt));
  switch (intent.kind) {
    case 'expense': case 'hypothetical':
      parts.push(t?.categoryName ?? intent.category, dayLabel(intent.date)); break;
    case 'income': case 'preference': parts.push(dayLabel(intent.date)); break;
    case 'goal': if (intent.byDate) parts.push(`by ${dayLabel(intent.byDate)}`); break;
    case 'commitmentChange': {
      const c = diff?.commitment;
      if (c) parts.push(c.name, `${formatMoney(c.before)} to ${formatMoney(c.after)}`, `from ${dayLabel(c.effectiveFrom)}`);
      break;
    }
    default: break;
  }
  return parts.join(' · ');
}

export function Card({ children, tone, label }: { children: ReactNode; tone?: 'coral'; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`pop rounded-[24px] border bg-(--c-surface-2) p-4 ${tone === 'coral' ? 'border-(--c-coral)' : 'border-(--c-line)'}`}
    >
      {children}
    </section>
  );
}

const ROWS: { label: string; pick: (s: Summary) => Money }[] = [
  { label: 'Today’s allowance', pick: (s) => s.todayAllowance },
  { label: 'Left today', pick: (s) => s.todayRemaining },
  { label: 'Flexible budget left', pick: (s) => s.flexibleRemaining },
  { label: 'Cash now', pick: (s) => s.balance },
  { label: 'Savings planned', pick: (s) => s.plannedSavings },
];

function spanLabel(m: CategoryMove): string {
  const d = m.days;
  if (d.length === 0) return '';
  const range = d.length > 1 ? `${dayLabel(d[0])} – ${dayLabel(d[d.length - 1])}` : dayLabel(d[0]);
  return `${range}${d.length > 1 ? ` · ${d.length} days` : ''}`;
}

export function BeforeAfter({ diff }: { diff: ChangeSet }) {
  const rows = ROWS.map((r) => ({ label: r.label, b: r.pick(diff.summaryBefore), a: r.pick(diff.summaryAfter) })).filter(
    (r, i) => i < 2 || r.b.pence !== r.a.pence,
  );
  const gapChanged = diff.fundingGapBefore.pence !== diff.fundingGapAfter.pence;
  const moves = [...diff.sources, ...diff.sameDaySources];
  return (
    <div className="mt-3 rounded-[16px] bg-(--c-bg) px-3 num" role="table" aria-label="Before and after">
      {moves.map((m, i) => (
        <div role="row" key={`m${i}`} className="flex items-baseline justify-between gap-3 border-b border-(--c-line) py-2.5 text-sm">
          <span role="rowheader"><span className="block font-bold">{m.categoryName}</span><span className="block text-xs text-(--c-muted)">{spanLabel(m)}</span></span>
          <span role="cell" className="font-bold">{`−${formatMoney(m.amount)}`}</span>
        </div>
      ))}
      {rows.map((r) => {
        const changed = r.b.pence !== r.a.pence;
        return (
          <div role="row" key={r.label} className="flex items-baseline justify-between gap-3 border-b border-(--c-line) py-2.5 text-sm last:border-b-0">
            <span role="rowheader" className="font-bold">{r.label}</span>
            <span role="cell" className="flex items-baseline gap-2">
              {changed ? (
                <>
                  <s className="text-(--c-muted)" aria-label={`was ${formatMoney(r.b)}`}>{formatMoney(r.b)}</s>
                  <span aria-hidden className="text-(--c-muted)">→</span>
                  <span className="font-bold">{formatMoney(r.a)}</span>
                </>
              ) : (
                <span className="text-(--c-muted)"><span className="font-bold text-(--c-text)">{formatMoney(r.a)}</span> same</span>
              )}
            </span>
          </div>
        );
      })}
      {gapChanged && (
        <div role="row" className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
          <span role="rowheader" className="font-bold">Not covered</span>
          <span role="cell" className="flex items-baseline gap-2">
            <s className="text-(--c-muted)">{formatMoney(diff.fundingGapBefore)}</s>
            <span aria-hidden className="text-(--c-muted)">→</span>
            <span className="font-bold text-(--c-coral)">{formatMoney(diff.fundingGapAfter)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

const pence = (m: Money | undefined, fallback = 0) => (m ? m.pence : fallback);

function Chip({ children, tone }: { children: ReactNode; tone?: 'changed' }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1.5 text-sm font-semibold num ${
        tone === 'changed' ? 'border border-(--c-coral) text-(--c-text)' : 'bg-(--c-bg) text-(--c-text)'
      }`}
    >
      {children}
    </span>
  );
}

/** Unchanged chips. Savings/reserve are only "unchanged" when the goal AND what is actually funded (G2) are identical. */
export function Protected({ diff }: { diff: ChangeSet }) {
  const b = diff.protectedBefore;
  const a = diff.protectedAfter;
  const same: string[] = [];
  const changed: string[] = [];
  for (const c of a.commitments) {
    if (c.total.pence <= 0) continue;
    const old = b.commitments.find((x) => x.id === c.id);
    if (old && old.total.pence === c.total.pence) same.push(`${c.name} ${formatMoney(c.total)}`);
    else changed.push(`${c.name} ${formatMoney(c.total)}`);
  }
  const reserveSame =
    b.minimumReserve.pence === a.minimumReserve.pence && pence(b.reserveShortfall) === pence(a.reserveShortfall);
  if (reserveSame) same.push(`Reserve ${formatMoney(a.minimumReserve)}`);
  else if (pence(a.reserveShortfall) > 0) changed.push(`Reserve ${formatMoney(a.reserveShortfall!)} short`);
  else changed.push(`Reserve ${formatMoney(a.minimumReserve)}`);
  if (a.savingsGoal.pence > 0 || b.savingsGoal.pence > 0) {
    const fundedB = pence(b.plannedSavings, b.savingsGoal.pence);
    const fundedA = pence(a.plannedSavings, a.savingsGoal.pence);
    if (b.savingsGoal.pence === a.savingsGoal.pence && fundedB === fundedA) same.push(`Savings goal ${formatMoney(a.savingsGoal)}`);
    else if (fundedA < a.savingsGoal.pence) changed.push(`Savings ${formatMoney(fundedA)} of ${formatMoney(a.savingsGoal)}`);
    else changed.push(`Savings goal ${formatMoney(a.savingsGoal)}`);
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {same.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
            Unchanged
          </span>
          {same.map((c) => <Chip key={c}>{c}</Chip>)}
        </div>
      )}
      {changed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Updated</span>
          {changed.map((c) => <Chip key={c} tone="changed">{c}</Chip>)}
        </div>
      )}
    </div>
  );
}

export interface AppliedCardProps {
  intent: Intent;
  source: ParseSource;
  diff: ChangeSet | null;
  explanation: Explanation;
  noop?: boolean;
}
export function AppliedCard(v: AppliedCardProps) {
  if (v.noop || !v.diff) {
    return (
      <Card label="Change result">
        <p className="text-base leading-snug">{v.explanation.sentence}</p>
      </Card>
    );
  }
  return (
    <Card label="Change applied">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-(--c-accent) px-3 py-1 text-sm font-bold text-(--c-accent-ink)">{kindLabel(v.intent)}</span>
        <SourceBadge source={v.source} />
      </div>
      <p className="mt-2 text-sm font-semibold text-(--c-muted) num">{actionLine(v.intent, v.diff)}</p>
      <p className="mt-3 text-base leading-snug">{v.explanation.sentence}</p>
      <BeforeAfter diff={v.diff} />
      <Protected diff={v.diff} />
    </Card>
  );
}

export interface PreviewCardProps {
  intent: Intent;
  /** Omit in chat (no "Read by" badge). */
  source?: ParseSource;
  pv: PreviewData;
  chosenOptionId: string | null;
  onChoose: (optionId: string) => void;
  /** Unique radio group name when several previews are on screen (chat). */
  radioGroup?: string;
}
export function PreviewCard(v: PreviewCardProps) {
  const aff = v.pv.affordability;
  const fits = !!aff && aff.fits;
  const chosen = !fits && aff && !aff.fits ? aff.options.find((o) => o.id === v.chosenOptionId) : undefined;
  const diff = fits && aff.fits ? aff.preview.diff : chosen?.preview.diff;
  const sentence = fits && aff.fits ? aff.preview.explanation.sentence : chosen?.preview.explanation.sentence;
  const amount = 'amount' in v.intent ? v.intent.amount : undefined;
  const hyp = v.intent.kind === 'hypothetical' ? v.intent : null;
  const detail = [amount ? formatMoney(amount) : '', hyp?.label ?? '', hyp ? dayLabel(hyp.date) : ''].filter(Boolean).join(' · ');

  return (
    <Card label="Preview" tone={fits ? undefined : 'coral'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-dashed border-(--c-lime) px-3 py-1 text-xs font-bold text-(--c-lime)">Preview · not applied</span>
        {v.source && <SourceBadge source={v.source} />}
      </div>

      {fits && aff.fits && (
        <>
          <p data-testid="preview-fits" className="mt-3 font-display text-3xl font-extrabold text-(--c-lime)">Yes, it fits.</p>
          {aff.message && (
            <p className="mt-2 inline-block rounded-full bg-(--c-lime-fill) px-4 py-2 text-sm font-bold leading-snug text-[#0B0C1F]">{aff.message}</p>
          )}
          <p className="mt-3 text-sm font-semibold text-(--c-muted) num">{detail}</p>
          <p className="mt-2 text-base leading-snug">{sentence}</p>
          {diff && <BeforeAfter diff={diff} />}
          {diff && <Protected diff={diff} />}
        </>
      )}

      {aff && !aff.fits && (
        <>
          <p data-testid="preview-shortfall" className="mt-3 font-display text-3xl font-extrabold text-(--c-coral) num">{formatMoney(aff.shortfall)} short</p>
          <p className="mt-2 text-base leading-snug">
            {aff.message ?? `That day has ${formatMoney(aff.dayRemaining)} left.`}
          </p>
          {aff.options.length === 0 ? (
            <p className="mt-3 text-sm">There is no flexible money to move without touching protected items, so nothing can be offered.</p>
          ) : (
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="mb-2 text-base font-bold">Cover {formatMoney(aff.shortfall)} from</legend>
              {aff.options.map((o) => {
                const on = v.chosenOptionId === o.id;
                const days = Math.max(1, ...o.sources.map((s) => s.days));
                const lo = o.sources.reduce((t, s) => t + Math.floor(s.amount / Math.max(1, s.days)), 0);
                const hi = o.sources.reduce((t, s) => t + Math.ceil(s.amount / Math.max(1, s.days)), 0);
                const perDay = lo === hi ? `−${formatMoney(lo)} a day` : `−${formatMoney(lo)} to −${formatMoney(hi)} a day`;
                return (
                  <label
                    key={o.id}
                    data-testid={`tradeoff-option-${o.id}`}
                    className={`spring flex min-h-14 cursor-pointer items-center gap-3 rounded-[16px] border-2 p-3 ${
                      on ? 'border-(--c-lime) bg-(--c-surface-2)' : 'border-(--c-line)'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`tradeoff-${v.radioGroup ?? 'x'}`}
                      value={o.id}
                      checked={on}
                      onChange={() => v.onChoose(o.id)}
                      className="size-5 shrink-0 accent-(--c-lime)"
                    />
                    <span className="text-sm">
                      <span className="block text-base font-bold leading-snug">{o.title}</span>
                      <span className="block text-(--c-muted) num">
                        {days} {days === 1 ? 'day' : 'days'} · {perDay}
                        {o.borrowed ? ` · plus ${formatMoney(o.borrowed)} borrowed` : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {chosen && diff && (
            <div className="pop mt-3">
              <p className="text-sm font-semibold text-(--c-muted) num">{detail}</p>
              <p className="mt-1 text-base leading-snug">{sentence}</p>
              <BeforeAfter diff={diff} />
              <Protected diff={diff} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function clarifyChips(missing: string[], cats: string[], bills: string[]): string[] {
  const m = missing;
  if (m.includes('intent')) return ['I spent', 'Can I spend'];
  if (m.includes('date')) return ['today', 'tomorrow', 'this Saturday'];
  if (m.includes('category')) return cats.map((c) => `on ${c.toLowerCase()}`);
  if (m.includes('target')) return bills;
  return [];
}

export function Spinner() {
  return (
    <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}


export function ClarifyCard({ question, chips, source, onReply }: { question: string; chips: string[]; source?: ParseSource; onReply: (chip: string) => void }) {
  return (
    <Card label="Question">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-(--c-accent) px-3 py-1 text-xs font-bold text-(--c-accent-ink)">Quick question</span>
        {source && <SourceBadge source={source} />}
      </div>
      <p className="mt-3 font-display text-xl font-extrabold leading-snug">{question}</p>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((ch) => (
            <button key={ch} type="button" onClick={() => onReply(ch)} className="spring min-h-11 rounded-full border border-(--c-line) bg-(--c-bg) px-4 text-sm font-bold">
              {ch}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-(--c-muted)">Or type your answer above. Nothing has changed yet.</p>
    </Card>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <Card label="Problem" tone="coral">
      <p className="text-base leading-snug">{message}</p>
      <p className="mt-2 text-xs text-(--c-muted)">Your plan is untouched.</p>
    </Card>
  );
}

export function PendingCard() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-[24px] border border-(--c-line) bg-(--c-surface-2) p-4 text-base font-semibold">
      <span className="text-(--c-lime)"><Spinner /></span>
      Reading that…
    </div>
  );
}

const btn = 'spring min-h-12 rounded-full px-6 text-base font-bold';

/** Discard + lime "Apply change" (always render in a sticky footer). */
export function PreviewActions({ ready, applying, needsOption, onDiscard, onApply }: { ready: boolean; applying?: boolean; needsOption?: boolean; onDiscard: () => void; onApply: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onDiscard} disabled={applying} className={`${btn} flex-1 border border-(--c-line) text-(--c-text) disabled:opacity-40`}>Discard</button>
      <button type="button" onClick={onApply} disabled={!ready || applying} aria-busy={applying} className={`${btn} flex-[1.4] bg-(--c-lime-fill) text-[#0B0C1F] disabled:opacity-50`}>
        {applying ? 'Applying…' : needsOption && !ready ? 'Pick an option' : 'Apply change'}
      </button>
    </div>
  );
}

export function UndoButton({ onUndo }: { onUndo: () => void }) {
  return (
    <button type="button" onClick={onUndo} className={`${btn} flex w-full items-center justify-center gap-2 border-2 border-(--c-lime) text-(--c-lime)`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Undo
    </button>
  );
}

export function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`${btn} w-full border border-(--c-line) text-(--c-text)`}>{children}</button>;
}
