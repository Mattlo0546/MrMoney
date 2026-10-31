'use client';
import { explain, formatMoney } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import { RESEARCH_LABEL } from '@/lib/agent/types';
import { BeforeAfter, Card, Protected, PreviewCard, actionLine, kindLabel } from '@/components/plan/change/cards';
import { dayLabel } from '@/components/plan/change/format';
import type { UiCard } from './model';
import { applyCard, chooseOption, confirmCard, discardCard, markClarifyAnswered, proposeRate, undoCard } from './chatStore';

const btn = 'spring min-h-11 rounded-full px-5 text-sm font-bold disabled:opacity-50';

function UndoIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function StateTag({ state }: { state: 'applied' | 'discarded' | 'expired' | 'failed' }) {
  const label = { applied: 'Applied', discarded: 'Discarded · nothing changed', expired: 'Expired · ask again to re-check', failed: 'Not applied' }[state];
  return (
    <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${state === 'applied' ? 'bg-(--c-lime-fill) text-[#0B0C1F]' : 'bg-(--c-bg) text-(--c-muted)'}`}>{label}</p>
  );
}

function PlanCreated({ c }: { c: Extract<UiCard, { type: 'plan_created' }> }) {
  const s = c.summary;
  const tiles = [
    { label: 'Funds now', v: s.balance },
    { label: 'For bills', v: s.reservedForCommitments },
    { label: 'Reserve', v: s.reserve },
    { label: 'Savings', v: s.plannedSavings },
  ];
  return (
    <section data-testid="card-plan-created" aria-label="Your plan" className="pop overflow-hidden rounded-[24px] border border-(--c-line) bg-(--c-surface-2)">
      <div className="bg-(--c-accent) p-4 text-(--c-accent-ink)">
        <div className="flex items-baseline justify-between text-sm font-bold">
          <span>Left today</span>
          <span>until {dayLabel(c.horizonEnd)}</span>
        </div>
        <p className="mt-1 font-display text-[56px] font-extrabold leading-none num">{formatMoney(s.todayRemaining)}</p>
        <p className="mt-2 flex justify-between text-sm font-bold num"><span>Flexible left</span><span>{formatMoney(s.flexibleRemaining)}</span></p>
      </div>
      <dl className="grid grid-cols-2 gap-2 p-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[16px] bg-(--c-bg) px-3 py-2">
            <dt className="text-xs font-semibold text-(--c-muted)">{t.label}</dt>
            <dd className="font-display text-xl font-extrabold num">{formatMoney(t.v)}</dd>
          </div>
        ))}
      </dl>
      {c.bills.length > 0 && (
        <p className="flex flex-wrap gap-2 px-3 pb-3">
          {c.bills.map((b) => (
            <span key={b.name} className="rounded-full bg-(--c-navy) px-3 py-1 text-xs font-bold text-white num">{b.name} {formatMoney(b.pence)}</span>
          ))}
        </p>
      )}
    </section>
  );
}

function ChangeApplied({ c }: { c: Extract<UiCard, { type: 'change_applied' }> }) {
  const snap = useAppSnapshot();
  const canUndo = !c.undone && !c.noop && !!c.diff && snap.canUndo && snap.changeId === c.changeId;
  if (c.noop || !c.diff) {
    return (
      <Card label="Change result">
        <div data-testid="card-change-applied"><p className="text-base leading-snug">{c.explanation.sentence}</p></div>
      </Card>
    );
  }
  return (
    <Card label="Change applied">
      <div data-testid="card-change-applied">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-(--c-accent) px-3 py-1 text-sm font-bold text-(--c-accent-ink)">{kindLabel(c.intent)}</span>
          <span className="text-sm font-semibold text-(--c-muted) num">{actionLine(c.intent, c.diff)}</span>
        </div>
        <p className="mt-3 text-[15px] leading-snug">{c.explanation.sentence}</p>
        <BeforeAfter diff={c.diff} />
        <Protected diff={c.diff} />
        {c.undone ? (
          <p className="mt-3 text-sm font-bold text-(--c-muted)">Undone</p>
        ) : canUndo ? (
          <button type="button" data-testid="card-undo" onClick={() => undoCard(c.id)} className={`${btn} mt-3 flex w-full items-center justify-center gap-2 border border-(--c-line) text-(--c-text)`}>
            <UndoIcon /> Undo
          </button>
        ) : null}
      </div>
    </Card>
  );
}

function Preview({ c }: { c: Extract<UiCard, { type: 'preview' }> }) {
  const open = c.state === 'open' && !!c.pv;
  const aff = c.pv?.affordability;
  const needsOption = !!aff && !aff.fits;
  const ready = !needsOption || !!c.chosenOptionId;
  const noOptions = needsOption && aff && !aff.fits && aff.options.length === 0;
  let body;
  if (!c.pv) {
    body = (
      <Card label="Preview">
        <p className="text-sm font-bold">{c.title}</p>
        <StateTag state={c.state === 'open' ? 'expired' : c.state} />
      </Card>
    );
  } else if (c.intent.kind === 'hypothetical' && aff) {
    body = <PreviewCard intent={c.intent} pv={c.pv} chosenOptionId={c.chosenOptionId} onChoose={(id) => chooseOption(c.id, id)} radioGroup={c.id} />;
  } else {
    const diff = c.pv.ok ? c.pv.diff : null;
    body = (
      <Card label="Preview">
        <span className="rounded-full border border-dashed border-(--c-lime) px-3 py-1 text-xs font-bold text-(--c-lime)">Preview · not applied</span>
        <p className="mt-3 font-display text-xl font-extrabold leading-snug">{c.title}</p>
        {diff && <p data-testid="preview-fits" className="mt-2 text-[15px] leading-snug">{explain(diff).sentence}</p>}
        {diff && <BeforeAfter diff={diff} />}
        {diff && <Protected diff={diff} />}
      </Card>
    );
  }
  return (
    <div data-testid="card-preview" className="flex flex-col gap-2">
      {body}
      {open && !noOptions && (
        <div className="flex gap-2">
          <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={`${btn} flex-1 border border-(--c-line) text-(--c-text)`}>Discard</button>
          <button type="button" data-testid="preview-apply" disabled={!ready} onClick={() => applyCard(c.id)} className={`${btn} flex-[1.4] bg-(--c-lime-fill) text-[#0B0C1F]`}>
            {needsOption && !ready ? 'Pick an option' : 'Apply'}
          </button>
        </div>
      )}
      {open && noOptions && (
        <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={`${btn} border border-(--c-line)`}>OK, leave it</button>
      )}
      {c.pv && c.state !== 'open' && <StateTag state={c.state} />}
    </div>
  );
}

function Confirm({ c }: { c: Extract<UiCard, { type: 'confirm' }> }) {
  return (
    <Card label="Confirm">
      <div data-testid="card-confirm">
        <span className="rounded-full border border-dashed border-(--c-lime) px-3 py-1 text-xs font-bold text-(--c-lime)">Needs your OK</span>
        <p className="mt-3 font-display text-xl font-extrabold leading-snug num">{c.title}</p>
        <ul className="mt-2 space-y-1 text-sm text-(--c-muted)">{c.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        {c.state === 'open' ? (
          <div className="mt-3 flex gap-2">
            <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={`${btn} flex-1 border border-(--c-line)`}>Not now</button>
            <button type="button" data-testid="preview-apply" onClick={() => confirmCard(c.id)} className={`${btn} flex-[1.4] bg-(--c-lime-fill) text-[#0B0C1F]`}>Use this rate</button>
          </div>
        ) : (
          <>
            <StateTag state={c.state} />
            {c.state === 'applied' && <a href="/projections" className="ml-2 text-sm font-bold text-(--c-lime) underline underline-offset-4">See projections</a>}
          </>
        )}
      </div>
    </Card>
  );
}

function Clarify({ c, onReply, disabled, showQuestion }: { c: Extract<UiCard, { type: 'clarify' }>; onReply: (t: string) => void; disabled: boolean; showQuestion: boolean }) {
  return (
    <div data-testid="card-clarify" className="pop flex flex-col gap-2">
      {showQuestion && c.question && <p className="max-w-[92%] rounded-[20px] rounded-bl-md bg-(--c-surface-2) px-4 py-3 text-[15px] leading-snug">{c.question}</p>}
      {!c.answered && c.chips.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Quick replies">
          {c.chips.map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => { markClarifyAnswered(c.id); onReply(ch); }}
              className={`${btn} border border-(--c-lime) bg-transparent text-(--c-lime)`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function timeLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(d);
}

function Research({ c, onPrefill }: { c: Extract<UiCard, { type: 'research_results' }>; onPrefill: (t: string) => void }) {
  return (
    <section data-testid="card-research" aria-label="Search results" className="pop rounded-[24px] border border-(--c-line) bg-(--c-surface-2) p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.sample ? 'bg-(--c-bg) text-(--c-muted)' : 'bg-(--c-lime-fill) text-[#0B0C1F]'}`}>{c.sample ? 'Sample offers' : 'Live search'}</span>
        {c.retrievedAt && <span className="text-xs text-(--c-muted)">Retrieved {timeLabel(c.retrievedAt)}</span>}
      </div>
      <p className="mt-2 text-xs font-semibold text-(--c-muted)">{c.label ?? RESEARCH_LABEL}</p>
      {c.items.length === 0 && <p className="mt-3 text-sm">No results with a source came back. Try asking a different way.</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {c.items.map((it, i) => (
          <li key={`${it.ref ?? i}`} data-testid="research-item" className="rounded-[16px] bg-(--c-bg) p-3">
            <p className="text-sm font-bold">{it.provider}{it.product ? <span className="font-semibold text-(--c-muted)"> · {it.product}</span> : null}</p>
            <p className="font-display text-2xl font-extrabold text-(--c-lime) num">{it.headline}</p>
            {it.conditions.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-(--c-muted)">{it.conditions.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ul>
            )}
            <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-bold text-(--c-text) underline underline-offset-4">
              {domainOf(it.sourceUrl)}<span className="sr-only"> (source for {it.provider}, opens in a new tab)</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </a>
            <div className="mt-2 flex flex-wrap gap-2">
              {typeof it.ratePercent === 'number' && (
                <button type="button" data-testid="use-in-projections" onClick={() => proposeRate({ provider: it.provider, headline: it.headline, ratePercent: it.ratePercent!, ref: it.ref })}
                  className={`${btn} min-h-10 bg-(--c-lime-fill) px-4 text-[#0B0C1F]`}>Use in projections</button>
              )}
              <button type="button" data-testid="apply-to-purchase"
                onClick={() => onPrefill(`Apply the ${it.provider} deal (${it.headline}${it.ref ? `, ref ${it.ref}` : ''}) to my planned `)}
                className={`${btn} min-h-10 border border-(--c-line) px-4`}>Apply to a purchase</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChatCard({ c, onReply, onPrefill, busy, messageText = '' }: { c: UiCard; onReply: (t: string) => void; onPrefill: (t: string) => void; busy: boolean; messageText?: string }) {
  switch (c.type) {
    case 'plan_created': return <PlanCreated c={c} />;
    case 'change_applied': return <ChangeApplied c={c} />;
    case 'preview': return <Preview c={c} />;
    case 'confirm': return <Confirm c={c} />;
    case 'clarify': return <Clarify c={c} onReply={onReply} disabled={busy} showQuestion={!messageText.includes(c.question.trim())} />;
    case 'research_results': return <Research c={c} onPrefill={onPrefill} />;
    case 'error':
      return (
        <Card label="Problem" tone="coral">
          <div data-testid="card-error"><p className="text-[15px] leading-snug">{c.message}</p><p className="mt-1 text-xs text-(--c-muted)">Your plan is untouched.</p></div>
        </Card>
      );
    case 'notice':
      return <p className="pop rounded-[16px] bg-(--c-surface-2) px-4 py-3 text-sm font-semibold">{c.text}</p>;
  }
}
