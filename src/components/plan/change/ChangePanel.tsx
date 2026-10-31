'use client';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/engine';
import type { ChangeSet, Intent, Money, Summary } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import {
  applyPreview, chooseOption, clarifyReply, dismissChange, undoChange, useChangeView,
  type ChangeView,
} from './changeState';
import { dayLabel } from './format';
import { MotionStyles } from './motion';

type Applied = Extract<ChangeView, { status: 'applied' }>;
type Preview = Extract<ChangeView, { status: 'preview' }>;

function SourceBadge({ source }: { source: 'gemini' | 'demo' }) {
  return (
    <span className="rounded-full border border-(--c-line) px-3 py-1 text-xs font-semibold text-(--c-muted)">
      {source === 'gemini' ? 'Read by Gemini' : 'Demo parsing'}
    </span>
  );
}

function actionPill(intent: Intent, diff: ChangeSet | null): string {
  const t = diff?.target;
  const amt = diff?.amount ?? ('amount' in intent ? intent.amount : undefined);
  const parts: string[] = [];
  switch (intent.kind) {
    case 'expense': parts.push('Expense', formatMoney(amt!), t?.categoryName ?? intent.category, dayLabel(intent.date)); break;
    case 'income': parts.push('Income', formatMoney(amt!), dayLabel(intent.date)); break;
    case 'hypothetical': parts.push('Planned', formatMoney(amt!), t?.categoryName ?? intent.category, dayLabel(intent.date)); break;
    case 'preference': parts.push('Keep available', formatMoney(amt!), dayLabel(intent.date)); break;
    case 'goal': parts.push('Savings goal', `+${formatMoney(amt!)}`, ...(intent.byDate ? [`by ${dayLabel(intent.byDate)}`] : [])); break;
    case 'commitmentChange': {
      const c = diff?.commitment;
      parts.push('Bill change');
      if (c) parts.push(c.name, `${formatMoney(c.before)} to ${formatMoney(c.after)}`, `from ${dayLabel(c.effectiveFrom)}`);
      break;
    }
    default: parts.push('Settings');
  }
  return parts.join(' · ');
}

function Card({ children, tone, label }: { children: ReactNode; tone?: 'coral'; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`pop rounded-[24px] border bg-(--c-surface) p-4 ${tone === 'coral' ? 'border-(--c-coral)' : 'border-(--c-line)'}`}
    >
      {children}
    </section>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-(--c-surface-2) px-3 py-1.5 text-sm font-semibold text-(--c-text) num">
      {children}
    </span>
  );
}

const ROWS: { label: string; pick: (s: Summary) => Money }[] = [
  { label: 'Today’s allowance', pick: (s) => s.todayAllowance },
  { label: 'Left today', pick: (s) => s.todayRemaining },
  { label: 'Flexible budget left', pick: (s) => s.flexibleRemaining },
  { label: 'Cash now', pick: (s) => s.balance },
  { label: 'Savings planned', pick: (s) => s.plannedSavings },
];

function BeforeAfter({ diff }: { diff: ChangeSet }) {
  const rows = ROWS.map((r) => ({ label: r.label, b: r.pick(diff.summaryBefore), a: r.pick(diff.summaryAfter) })).filter(
    (r, i) => i < 2 || r.b.pence !== r.a.pence,
  );
  const gapChanged = diff.fundingGapBefore.pence !== diff.fundingGapAfter.pence;
  return (
    <table className="mt-3 w-full text-sm num">
      <caption className="sr-only">Before and after</caption>
      <thead>
        <tr className="text-left text-xs text-(--c-muted)">
          <th className="py-1 font-semibold" scope="col">&nbsp;</th>
          <th className="py-1 text-right font-semibold" scope="col">Before</th>
          <th className="py-1 text-right font-semibold" scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const changed = r.b.pence !== r.a.pence;
          return (
            <tr key={r.label} className="border-t border-(--c-line)">
              <th scope="row" className="py-2 text-left font-normal text-(--c-muted)">{r.label}</th>
              <td className="py-2 text-right text-(--c-muted)">{formatMoney(r.b)}</td>
              <td className={`py-2 text-right font-bold ${changed ? 'text-(--c-lime)' : ''}`}>{formatMoney(r.a)}</td>
            </tr>
          );
        })}
        {gapChanged && (
          <tr className="border-t border-(--c-line)">
            <th scope="row" className="py-2 text-left font-normal text-(--c-muted)">Not covered</th>
            <td className="py-2 text-right text-(--c-muted)">{formatMoney(diff.fundingGapBefore)}</td>
            <td className="py-2 text-right font-bold text-(--c-coral)">{formatMoney(diff.fundingGapAfter)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Protected({ diff }: { diff: ChangeSet }) {
  const b = diff.protectedBefore;
  const a = diff.protectedAfter;
  const same: string[] = [];
  const changed: string[] = [];
  for (const c of a.commitments) {
    if (c.total.pence <= 0) continue;
    const old = b.commitments.find((x) => x.id === c.id);
    (old && old.total.pence === c.total.pence ? same : changed).push(c.name);
  }
  (b.minimumReserve.pence === a.minimumReserve.pence ? same : changed).push('Emergency reserve');
  if (a.savingsGoal.pence > 0) (b.savingsGoal.pence === a.savingsGoal.pence ? same : changed).push('Savings goal');
  return (
    <p className="mt-3 text-sm text-(--c-muted)">
      {same.length > 0 && (
        <>
          <strong className="font-semibold text-(--c-text)">Unchanged:</strong> {same.join(', ')}.
        </>
      )}
      {changed.length > 0 && (
        <>
          {same.length > 0 ? ' ' : ''}
          <strong className="font-semibold text-(--c-text)">Updated as you asked:</strong> {changed.join(', ')}.
        </>
      )}
    </p>
  );
}

function AppliedCard({ v }: { v: Applied }) {
  const snap = useAppSnapshot();
  const current = snap.changeId === v.changeId && snap.canUndo;
  if (v.noop || !v.diff) {
    return (
      <Card label="Change result">
        <p className="text-sm text-(--c-text)">{v.explanation.sentence}</p>
      </Card>
    );
  }
  return (
    <Card label="Change applied">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{actionPill(v.intent, v.diff)}</Pill>
        <SourceBadge source={v.source} />
      </div>
      <p className="mt-3 text-base leading-snug text-(--c-text)">{v.explanation.sentence}</p>
      <BeforeAfter diff={v.diff} />
      <Protected diff={v.diff} />
      {current && (
        <button
          type="button"
          onClick={undoChange}
          className="spring mt-4 min-h-12 w-full rounded-full border-2 border-(--c-lime) bg-transparent px-6 text-base font-bold text-(--c-lime)"
        >
          Undo
        </button>
      )}
    </Card>
  );
}

function PreviewCard({ v }: { v: Preview }) {
  const aff = v.pv.affordability;
  const fits = !!aff && aff.fits;
  const chosen = !fits && aff && !aff.fits ? aff.options.find((o) => o.id === v.chosenOptionId) : undefined;
  const diff = fits && aff.fits ? aff.preview.diff : chosen?.preview.diff;
  const sentence = fits && aff.fits ? aff.preview.explanation.sentence : chosen?.preview.explanation.sentence;
  const pillDiff = diff ?? null;
  const amount = 'amount' in v.intent ? v.intent.amount : undefined;
  const label = v.intent.kind === 'hypothetical' ? v.intent.label : undefined;

  return (
    <Card label="Preview" tone={fits ? undefined : 'coral'}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{pillDiff ? actionPill(v.intent, pillDiff) : `Planned · ${amount ? formatMoney(amount) : ''}${label ? ` · ${label}` : ''}${v.intent.kind === 'hypothetical' ? ` · ${dayLabel(v.intent.date)}` : ''}`}</Pill>
        <SourceBadge source={v.source} />
        <span className="rounded-full bg-(--c-surface-2) px-3 py-1 text-xs font-semibold text-(--c-muted)">Preview · not applied yet</span>
      </div>

      {fits && aff.fits && (
        <>
          <p className="mt-3 font-display text-2xl font-extrabold text-(--c-lime)">Fits</p>
          <p className="mt-1 text-base leading-snug">{sentence}</p>
          {diff && <BeforeAfter diff={diff} />}
          {diff && <Protected diff={diff} />}
        </>
      )}

      {aff && !aff.fits && (
        <>
          <p className="mt-3 font-display text-2xl font-extrabold text-(--c-coral) num">
            {formatMoney(aff.shortfall)} short
          </p>
          <p className="mt-1 text-sm text-(--c-muted)">
            That day has {formatMoney(aff.dayRemaining)} left. Pick where the rest could come from:
          </p>
          {aff.options.length === 0 ? (
            <p className="mt-3 text-sm">There is no flexible money to move without touching protected items, so nothing can be offered.</p>
          ) : (
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="sr-only">Trade-off options</legend>
              {aff.options.map((o) => {
                const on = v.chosenOptionId === o.id;
                return (
                  <label
                    key={o.id}
                    className={`spring flex min-h-12 cursor-pointer items-start gap-3 rounded-[16px] border p-3 ${
                      on ? 'border-(--c-lime) bg-(--c-surface-2)' : 'border-(--c-line)'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tradeoff"
                      value={o.id}
                      checked={on}
                      onChange={() => chooseOption(o.id)}
                      className="mt-1 size-4 accent-(--c-lime)"
                    />
                    <span className="text-sm">
                      <span className="block font-semibold">{o.title}</span>
                      <span className="block text-(--c-muted) num">
                        {o.sources.map((s) => `${s.categoryName} −${formatMoney(s.amount)}`).join(' · ')}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {chosen && diff && (
            <div className="pop mt-3">
              <p className="text-base leading-snug">{sentence}</p>
              <BeforeAfter diff={diff} />
              <Protected diff={diff} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => applyPreview()}
          disabled={!fits && !chosen}
          className="spring min-h-12 flex-1 rounded-full bg-(--c-accent) px-6 text-base font-bold text-(--c-accent-ink) disabled:opacity-40"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={dismissChange}
          className="spring min-h-12 rounded-full border border-(--c-line) px-5 text-base font-semibold"
        >
          Discard
        </button>
      </div>
    </Card>
  );
}

function clarifyChips(v: Extract<ChangeView, { status: 'clarify' }>, cats: string[], bills: string[]): string[] {
  const m = v.missing;
  if (m.includes('intent')) return ['I spent', 'Can I spend'];
  if (m.includes('date')) return ['today', 'tomorrow', 'this Saturday'];
  if (m.includes('category')) return cats.map((c) => `on ${c.toLowerCase()}`);
  if (m.includes('target')) return bills;
  return [];
}

export function ChangePanel() {
  const v = useChangeView();
  const snap = useAppSnapshot();
  const cats = snap.state?.profile.categories.map((c) => c.name) ?? [];
  const bills = snap.state?.commitments.map((c) => c.name) ?? [];

  let body: ReactNode = null;
  switch (v.status) {
    case 'idle':
      body = (
        <p className="text-sm text-(--c-muted)">
          Tell me what changed and I’ll show exactly what moves in your plan. Nothing is saved until you say so.
        </p>
      );
      break;
    case 'pending':
      body = <p className="text-sm text-(--c-muted)">Reading “{v.text}”…</p>;
      break;
    case 'clarify': {
      const chips = clarifyChips(v, cats, bills);
      body = (
        <Card label="Question">
          <p className="text-base font-semibold leading-snug">{v.question}</p>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void clarifyReply(c)}
                  className="spring min-h-11 rounded-full border border-(--c-line) bg-(--c-surface-2) px-4 text-sm font-semibold"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-(--c-muted)">Or edit your message above and send it again. Nothing has changed yet.</p>
        </Card>
      );
      break;
    }
    case 'error':
      body = (
        <Card label="Problem" tone="coral">
          <p className="text-base leading-snug">{v.message}</p>
          <p className="mt-2 text-xs text-(--c-muted)">Your plan is untouched.</p>
        </Card>
      );
      break;
    case 'preview':
      body = <PreviewCard v={v} />;
      break;
    case 'applied':
      body = <AppliedCard v={v} />;
      break;
    case 'undone':
      body = (
        <Card label="Undone">
          <p className="text-base font-semibold">Undone. Your plan is back exactly as it was.</p>
        </Card>
      );
      break;
  }

  return (
    <div className="spc flex flex-col gap-3">
      <MotionStyles />
      {/* key restarts the entrance animation for each new result */}
      <div aria-live="polite" aria-atomic="false" key={v.status + (v.status === 'applied' ? v.changeId : '')}>
        {body}
      </div>
    </div>
  );
}
