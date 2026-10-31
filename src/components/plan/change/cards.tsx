'use client';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/engine';
import type { ChangeSet, CategoryMove, Explanation, Intent, Money, Summary } from '@/lib/engine';
import type { ParseSource } from '@/lib/parser/types';
import { ArrowRight, Lock, RefreshCw, Sparkles, Undo2 } from 'lucide-react';
import { IconBadge, WithIcon, type ValueKind } from '@/components/ui/Value';
import { bucketOf } from '../calendar/data';
import { BUCKET_ICON } from '../calendar/shared';
import type { PreviewData } from './changeState';
import { dayLabel } from './format';


/*
 * Standalone, prop-driven result cards (no dependency on changeState's store). Reusable inside chat messages.
 * Wrap in an element with class "spc" and render <MotionStyles /> once (ChangePanel does this).
 */

export function SourceBadge({ source }: { source: ParseSource }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
      <Sparkles aria-hidden="true" size={12} strokeWidth={2.4} />
      {source === 'gemini' ? 'Read by Gemini' : 'Demo parsing'}
    </span>
  );
}

export function UserBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] rounded-[20px] rounded-br-md bg-grad-primary px-4 py-3 text-base font-semibold leading-snug shadow-glow">{text}</p>
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

/** One part of the detail line, with the icon that says what the figure is. */
export interface ActionPart { icon: ValueKind; text: string }

/** "£35 · Household · Tue 10 Nov" as parts, each with its value icon. */
export function actionParts(intent: Intent, diff: ChangeSet | null): ActionPart[] {
  const t = diff?.target;
  const amt = diff?.amount ?? ('amount' in intent ? intent.amount : undefined);
  const parts: ActionPart[] = [];
  const amountIcon: ValueKind = intent.kind === 'income' ? 'income' : intent.kind === 'goal' ? 'goal' : intent.kind === 'commitmentChange' ? 'bills' : intent.kind === 'hypothetical' || intent.kind === 'preference' ? 'planned' : 'spent';
  if (amt) parts.push({ icon: amountIcon, text: formatMoney(amt) });
  switch (intent.kind) {
    case 'expense': case 'hypothetical':
      parts.push({ icon: 'category', text: t?.categoryName ?? intent.category }, { icon: 'date', text: dayLabel(intent.date) }); break;
    case 'income': case 'preference': parts.push({ icon: 'date', text: dayLabel(intent.date) }); break;
    case 'goal': if (intent.byDate) parts.push({ icon: 'date', text: `by ${dayLabel(intent.byDate)}` }); break;
    case 'commitmentChange': {
      const c = diff?.commitment;
      if (c) parts.push({ icon: 'bills', text: c.name }, { icon: 'pounds', text: `${formatMoney(c.before)} to ${formatMoney(c.after)}` }, { icon: 'date', text: `from ${dayLabel(c.effectiveFrom)}` });
      break;
    }
    default: break;
  }
  return parts;
}

/** "£35 · Household · Tue 10 Nov" — the muted detail line under the pill (plain text). */
export function actionLine(intent: Intent, diff: ChangeSet | null): string {
  return actionParts(intent, diff).map((p) => p.text).join(' · ');
}

/** The detail line with an icon on every value. */
export function ActionLine({ parts, className = '' }: { parts: ActionPart[]; className?: string }) {
  if (parts.length === 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted num ${className}`}>
      {parts.map((p, i) => <WithIcon key={i} icon={p.icon} tone="primary" size={14}>{p.text}</WithIcon>)}
    </p>
  );
}

export function Card({ children, tone, label }: { children: ReactNode; tone?: 'coral'; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`pop rounded-[24px] border bg-surface p-4 shadow-soft ${tone === 'coral' ? 'border-neg/40' : 'border-line'}`}
    >
      {children}
    </section>
  );
}

const ROWS: { label: string; icon: ValueKind; pick: (s: Summary) => Money }[] = [
  { label: 'Today’s allowance', icon: 'allowance', pick: (s) => s.todayAllowance },
  { label: 'Left today', icon: 'allowance', pick: (s) => s.todayRemaining },
  { label: 'Flexible budget left', icon: 'flexible', pick: (s) => s.flexibleRemaining },
  { label: 'Cash now', icon: 'balance', pick: (s) => s.balance },
  { label: 'Savings planned', icon: 'savings', pick: (s) => s.plannedSavings },
];

function spanLabel(m: CategoryMove): string {
  const d = m.days;
  if (d.length === 0) return '';
  const range = d.length > 1 ? `${dayLabel(d[0])} – ${dayLabel(d[d.length - 1])}` : dayLabel(d[0]);
  return `${range}${d.length > 1 ? ` · ${d.length} days` : ''}`;
}

export function BeforeAfter({ diff }: { diff: ChangeSet }) {
  const rows = ROWS.map((r) => ({ label: r.label, icon: r.icon, b: r.pick(diff.summaryBefore), a: r.pick(diff.summaryAfter) })).filter(
    (r, i) => i < 2 || r.b.pence !== r.a.pence,
  );
  const gapChanged = diff.fundingGapBefore.pence !== diff.fundingGapAfter.pence;
  const moves = [...diff.sources, ...diff.sameDaySources];
  return (
    <div className="mt-3 rounded-[16px] border border-line bg-surface-2 px-3 num" role="table" aria-label="Before and after">
      {moves.map((m, i) => (
        <div role="row" key={`m${i}`} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm">
          <span role="rowheader"><span className="block font-bold">{m.categoryName}</span><WithIcon icon="date" tone="neutral" size={12} className="text-xs text-muted">{spanLabel(m)}</WithIcon></span>
          <span role="cell"><WithIcon icon={BUCKET_ICON[bucketOf(m.category, m.categoryName)]} tone="negative" size={15} className="font-bold">{`−${formatMoney(m.amount)}`}</WithIcon></span>
        </div>
      ))}
      {rows.map((r) => {
        const changed = r.b.pence !== r.a.pence;
        return (
          <div role="row" key={r.label} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
            <span role="rowheader" className="font-bold">{r.label}</span>
            <span role="cell" className="flex items-center gap-2">
              <WithIcon icon={r.icon} tone="primary" size={15} className="">
                {changed ? (
                  <>
                    <s className="text-muted" aria-label={`was ${formatMoney(r.b)}`}>{formatMoney(r.b)}</s>
                    <ArrowRight aria-hidden="true" size={13} strokeWidth={2.5} className="shrink-0 text-muted" />
                    <span className="font-bold">{formatMoney(r.a)}</span>
                  </>
                ) : (
                  <span className="text-muted"><span className="font-bold text-text">{formatMoney(r.a)}</span> same</span>
                )}
              </WithIcon>
            </span>
          </div>
        );
      })}
      {gapChanged && (
        <div role="row" className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span role="rowheader" className="font-bold">Not covered</span>
          <span role="cell" className="flex items-center gap-2">
            <WithIcon icon="shortfall" tone="negative" size={15}>
              <s className="text-muted">{formatMoney(diff.fundingGapBefore)}</s>
              <ArrowRight aria-hidden="true" size={13} strokeWidth={2.5} className="shrink-0 text-muted" />
              <span className="font-bold text-neg">{formatMoney(diff.fundingGapAfter)}</span>
            </WithIcon>
          </span>
        </div>
      )}
    </div>
  );
}

const pence = (m: Money | undefined, fallback = 0) => (m ? m.pence : fallback);

interface ProtectedChip { text: string; icon: ValueKind; bad?: boolean }

function Chip({ chip, tone }: { chip: ProtectedChip; tone?: 'changed' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold num ${
        tone === 'changed' ? (chip.bad ? 'border border-neg/40 bg-grad-negative-soft text-text' : 'border border-pos/40 bg-grad-positive-soft text-text') : 'border border-line bg-surface text-text'
      }`}
    >
      <WithIcon icon={chip.icon} tone={tone === 'changed' ? (chip.bad ? 'negative' : 'positive') : 'primary'} size={14}>{chip.text}</WithIcon>
    </span>
  );
}

/** Unchanged chips. Savings/reserve are only "unchanged" when the goal AND what is actually funded (G2) are identical. */
export function Protected({ diff }: { diff: ChangeSet }) {
  const b = diff.protectedBefore;
  const a = diff.protectedAfter;
  const same: ProtectedChip[] = [];
  const changed: ProtectedChip[] = [];
  for (const c of a.commitments) {
    if (c.total.pence <= 0) continue;
    const old = b.commitments.find((x) => x.id === c.id);
    const chip: ProtectedChip = { text: `${c.name} ${formatMoney(c.total)}`, icon: 'bills' };
    if (old && old.total.pence === c.total.pence) same.push(chip);
    else changed.push(chip);
  }
  const reserveSame =
    b.minimumReserve.pence === a.minimumReserve.pence && pence(b.reserveShortfall) === pence(a.reserveShortfall);
  if (reserveSame) same.push({ text: `Reserve ${formatMoney(a.minimumReserve)}`, icon: 'reserve' });
  else if (pence(a.reserveShortfall) > 0) changed.push({ text: `Reserve ${formatMoney(a.reserveShortfall!)} short`, icon: 'shortfall', bad: true });
  else changed.push({ text: `Reserve ${formatMoney(a.minimumReserve)}`, icon: 'reserve' });
  if (a.savingsGoal.pence > 0 || b.savingsGoal.pence > 0) {
    const fundedB = pence(b.plannedSavings, b.savingsGoal.pence);
    const fundedA = pence(a.plannedSavings, a.savingsGoal.pence);
    if (b.savingsGoal.pence === a.savingsGoal.pence && fundedB === fundedA) same.push({ text: `Savings goal ${formatMoney(a.savingsGoal)}`, icon: 'savings' });
    else if (fundedA < a.savingsGoal.pence) changed.push({ text: `Savings ${formatMoney(fundedA)} of ${formatMoney(a.savingsGoal)}`, icon: 'savings' });
    else changed.push({ text: `Savings goal ${formatMoney(a.savingsGoal)}`, icon: 'savings' });
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {same.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold">
            <Lock aria-hidden="true" size={14} strokeWidth={2.4} />
            Unchanged
          </span>
          {same.map((c) => <Chip key={c.text} chip={c} />)}
        </div>
      )}
      {changed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold">
            <RefreshCw aria-hidden="true" size={14} strokeWidth={2.4} />
            Updated
          </span>
          {changed.map((c) => <Chip key={c.text} chip={c} tone="changed" />)}
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
        <span className="rounded-full bg-grad-primary px-3 py-1 text-sm font-bold">{kindLabel(v.intent)}</span>
        <SourceBadge source={v.source} />
      </div>
      <ActionLine parts={actionParts(v.intent, v.diff)} className="mt-2" />
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
  const detail: ActionPart[] = [];
  if (amount) detail.push({ icon: 'planned', text: formatMoney(amount) });
  if (hyp?.label) detail.push({ icon: 'category', text: hyp.label });
  if (hyp) detail.push({ icon: 'date', text: dayLabel(hyp.date) });

  return (
    <Card label="Preview" tone={fits ? undefined : 'coral'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-accent-2 bg-grad-primary-soft px-3 py-1 text-xs font-bold text-accent"><WithIcon icon="preview" size={13}>Preview · not applied</WithIcon></span>
        {v.source && <SourceBadge source={v.source} />}
      </div>

      {fits && aff.fits && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <IconBadge icon="sparkle" tone="positive" size="md" solid />
            <p data-testid="preview-fits" className="font-display text-3xl font-extrabold text-pos">Yes, it fits.</p>
          </div>
          {aff.message && (
            <p className="mt-2 inline-block rounded-full bg-grad-positive px-4 py-2 text-sm font-bold leading-snug">{aff.message}</p>
          )}
          <ActionLine parts={detail} className="mt-3" />
          <p className="mt-2 text-base leading-snug">{sentence}</p>
          {diff && <BeforeAfter diff={diff} />}
          {diff && <Protected diff={diff} />}
        </>
      )}

      {aff && !aff.fits && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <IconBadge icon="shortfall" tone="negative" size="md" solid />
            <p data-testid="preview-shortfall" className="font-display text-3xl font-extrabold text-neg num">{formatMoney(aff.shortfall)} short</p>
          </div>
          <p className="mt-2 text-base leading-snug">
            {aff.message ?? `That day has ${formatMoney(aff.dayRemaining)} left.`}
          </p>
          {aff.options.length === 0 ? (
            <p className="mt-3 text-sm">There is no flexible money to move without touching protected items, so nothing can be offered.</p>
          ) : (
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="mb-2 text-base font-bold"><WithIcon icon="shortfall" tone="negative" size={16}>Cover {formatMoney(aff.shortfall)} from</WithIcon></legend>
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
                      on ? 'border-accent bg-grad-primary-soft' : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`tradeoff-${v.radioGroup ?? 'x'}`}
                      value={o.id}
                      checked={on}
                      onChange={() => v.onChoose(o.id)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <span className="text-sm">
                      <span className="block text-base font-bold leading-snug">{o.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted num">
                        <WithIcon icon="days" tone="primary" size={13}>{days} {days === 1 ? 'day' : 'days'}</WithIcon>
                        <WithIcon icon="move" tone="primary" size={13}>{perDay}</WithIcon>
                        {o.borrowed ? <WithIcon icon="balance" tone="primary" size={13}>{`plus ${formatMoney(o.borrowed)} borrowed`}</WithIcon> : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {chosen && diff && (
            <div className="pop mt-3">
              <ActionLine parts={detail} />
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
        <span className="rounded-full bg-grad-primary px-3 py-1 text-xs font-bold">Quick question</span>
        {source && <SourceBadge source={source} />}
      </div>
      <p className="mt-3 font-display text-xl font-extrabold leading-snug">{question}</p>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((ch) => (
            <button key={ch} type="button" onClick={() => onReply(ch)} className="spring min-h-11 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold shadow-soft hover:bg-surface-2">
              {ch}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Or type your answer above. Nothing has changed yet.</p>
    </Card>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <Card label="Problem" tone="coral">
      <p className="text-base leading-snug">{message}</p>
      <p className="mt-2 text-xs text-muted">Your plan is untouched.</p>
    </Card>
  );
}

export function PendingCard() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-[24px] border border-line bg-surface p-4 text-base font-semibold shadow-soft">
      <span className="text-accent"><Spinner /></span>
      Reading that…
    </div>
  );
}

const btn = 'spring min-h-12 rounded-full px-6 text-base font-bold';

/** Discard + gradient "Apply change" (always render in a sticky footer). */
export function PreviewActions({ ready, applying, needsOption, onDiscard, onApply }: { ready: boolean; applying?: boolean; needsOption?: boolean; onDiscard: () => void; onApply: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onDiscard} disabled={applying} className={`${btn} flex-1 border border-line-strong bg-surface text-text hover:bg-surface-2 disabled:opacity-40`}>Discard</button>
      <button type="button" onClick={onApply} disabled={!ready || applying} aria-busy={applying} className={`${btn} flex-[1.4] bg-grad-primary shadow-glow disabled:opacity-50 disabled:shadow-none disabled:saturate-50`}>
        {applying ? 'Applying…' : needsOption && !ready ? 'Pick an option' : 'Apply change'}
      </button>
    </div>
  );
}

export function UndoButton({ onUndo }: { onUndo: () => void }) {
  return (
    <button type="button" onClick={onUndo} className={`${btn} flex w-full items-center justify-center gap-2 border-2 border-accent text-accent hover:bg-grad-primary-soft`}>
      <Undo2 aria-hidden="true" size={18} strokeWidth={2.4} />
      Undo
    </button>
  );
}

export function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`${btn} w-full border border-line-strong bg-surface text-text hover:bg-surface-2`}>{children}</button>;
}
