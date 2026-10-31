'use client';
import { explain, formatMoney, formatShortDate } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import { RESEARCH_LABEL } from '@/lib/agent/types';
import { Check, Clock, ExternalLink, TrendingUp, Undo2, X, TriangleAlert, Search } from 'lucide-react';
import { BeforeAfter, Card, Protected, PreviewCard, ActionLine, actionParts, kindLabel } from '@/components/plan/change/cards';
import { IconBadge, Stat, WithIcon } from '@/components/ui/Value';
import { dayLabel } from '@/components/plan/change/format';
import type { UiCard } from './model';
import { applyCard, applyResearchDeal, chooseOption, confirmCard, discardCard, markClarifyAnswered, proposeRate, undoCard } from './chatStore';

const btn = 'spring min-h-11 rounded-full px-5 text-sm font-bold disabled:opacity-50 disabled:saturate-50';
const btnPrimary = `${btn} bg-grad-primary shadow-glow disabled:shadow-none`;
const btnQuiet = `${btn} border border-line-strong bg-surface text-text shadow-soft hover:bg-surface-2`;

function StateTag({ state }: { state: 'applied' | 'discarded' | 'expired' | 'failed' }) {
  const label = { applied: 'Applied', discarded: 'Discarded · nothing changed', expired: 'Expired · ask again to re-check', failed: 'Not applied' }[state];
  const Icon = { applied: Check, discarded: X, expired: Clock, failed: TriangleAlert }[state];
  return (
    <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${state === 'applied' ? 'bg-grad-positive' : 'border border-line bg-surface-2 text-muted'}`}>
      <Icon aria-hidden="true" size={13} strokeWidth={2.6} />
      {label}
    </p>
  );
}

function PlanCreated({ c }: { c: Extract<UiCard, { type: 'plan_created' }> }) {
  const s = c.summary;
  const tiles = [
    { label: 'Funds now', icon: 'balance', tone: 'positive', v: s.balance },
    { label: 'For bills', icon: 'bills', tone: 'warning', v: s.reservedForCommitments },
    { label: 'Reserve', icon: 'reserve', tone: 'primary', v: s.reserve },
    { label: 'Savings', icon: 'savings', tone: 'positive', v: s.plannedSavings },
  ] as const;
  return (
    <section data-testid="card-plan-created" aria-label="Your plan" className="pop overflow-hidden rounded-[24px] border border-line bg-surface shadow-soft">
      <div className="bg-grad-hero p-4">
        <div className="flex items-center justify-between gap-2 text-sm font-bold">
          <span>Left today</span>
          <WithIcon icon="date" tone="onGradient" size={14}>until {dayLabel(c.horizonEnd)}</WithIcon>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <IconBadge icon="allowance" tone="onGradient" size="lg" />
          <p className="font-display text-[56px] font-extrabold leading-none num">{formatMoney(s.todayRemaining)}</p>
        </div>
        <p className="mt-3 flex items-center justify-between text-sm font-bold num"><span>Flexible left</span><WithIcon icon="flexible" tone="onGradient" size={15}>{formatMoney(s.flexibleRemaining)}</WithIcon></p>
      </div>
      <dl className="grid grid-cols-2 gap-2 p-3">
        {tiles.map((t) => (
          <Stat key={t.label} icon={t.icon} tone={t.tone} label={t.label} value={formatMoney(t.v)} className="rounded-[16px] border-line bg-surface-2 p-3 shadow-none [&_dd]:text-xl" />
        ))}
      </dl>
      {c.bills.length > 0 && (
        <p className="flex flex-wrap gap-2 px-3 pb-3">
          {c.bills.map((b) => (
            <span key={b.name} className="inline-flex items-center gap-1.5 rounded-full bg-grad-warning px-3 py-1 text-xs font-bold num"><WithIcon icon="bills" tone="onGradient" size={12}>{b.name} {formatMoney(b.pence)}</WithIcon></span>
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
          <span className="rounded-full bg-grad-primary px-3 py-1 text-sm font-bold">{kindLabel(c.intent)}</span>
        </div>
        <ActionLine parts={actionParts(c.intent, c.diff)} className="mt-2" />
        <p className="mt-3 text-[15px] leading-snug">{c.explanation.sentence}</p>
        <BeforeAfter diff={c.diff} />
        <Protected diff={c.diff} />
        {c.undone ? (
          <p className="mt-3 text-sm font-bold text-muted">Undone</p>
        ) : canUndo ? (
          <button type="button" data-testid="card-undo" onClick={() => undoCard(c.id)} className={`${btnQuiet} mt-3 flex w-full items-center justify-center gap-2`}>
            <Undo2 aria-hidden="true" size={16} strokeWidth={2.4} /> Undo
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
        <span className="inline-flex rounded-full border border-dashed border-accent-2 bg-grad-primary-soft px-3 py-1 text-xs font-bold text-accent"><WithIcon icon="preview" size={13}>Preview · not applied</WithIcon></span>
        <p className="mt-3 font-display text-xl font-extrabold leading-snug">{c.title}</p>
        {c.goal ? (
          <>
            <p data-testid="preview-fits" className="mt-2 text-[15px] leading-snug">{c.goal.sentence}</p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {c.goal.changes.slice(0, 6).map((d, i) => (
                <li key={d.date} className="pop flex justify-between gap-3" style={{ animationDelay: `${i * 60}ms` }}>
                  <WithIcon icon="date" tone="neutral" size={13} className="text-muted">{formatShortDate(d.date)} · {d.what}</WithIcon>
                  {d.savedPence > 0 && <WithIcon icon="savings" tone="positive" size={13} className="num font-bold">{d.what.startsWith('treats') ? '−' : ''}{formatMoney(d.savedPence)}</WithIcon>}
                </li>
              ))}
              {c.goal.changes.length > 6 && <li className="text-muted"><WithIcon icon="count" tone="neutral" size={13}>+ {c.goal.changes.length - 6} more days</WithIcon></li>}
            </ul>
          </>
        ) : (
          diff && <p data-testid="preview-fits" className="mt-2 text-[15px] leading-snug">{explain(diff).sentence}</p>
        )}
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
          <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={`${btnQuiet} flex-1`}>Discard</button>
          <button type="button" data-testid="preview-apply" disabled={!ready} onClick={() => applyCard(c.id)} className={`${btnPrimary} flex-[1.4]`}>
            {needsOption && !ready ? 'Pick an option' : 'Apply'}
          </button>
        </div>
      )}
      {open && noOptions && (
        <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={btnQuiet}>OK, leave it</button>
      )}
      {c.pv && c.state !== 'open' && <StateTag state={c.state} />}
    </div>
  );
}

function Confirm({ c }: { c: Extract<UiCard, { type: 'confirm' }> }) {
  return (
    <Card label="Confirm">
      <div data-testid="card-confirm">
        <span className="inline-flex rounded-full border border-dashed border-accent-2 bg-grad-primary-soft px-3 py-1 text-xs font-bold text-accent"><WithIcon icon="percent" size={13}>Needs your OK</WithIcon></span>
        <p className="mt-3 flex items-start gap-2 font-display text-xl font-extrabold leading-snug num"><IconBadge icon="percent" tone="primary" size="sm" className="mt-0.5" />{c.title}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">{c.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        {c.state === 'open' ? (
          <div className="mt-3 flex gap-2">
            <button type="button" data-testid="preview-discard" onClick={() => discardCard(c.id)} className={`${btnQuiet} flex-1`}>Not now</button>
            <button type="button" data-testid="preview-apply" onClick={() => confirmCard(c.id)} className={`${btnPrimary} flex-[1.4]`}>Use this rate</button>
          </div>
        ) : (
          <>
            <StateTag state={c.state} />
            {c.state === 'applied' && <a href="/projections" className="ml-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent underline underline-offset-4"><TrendingUp aria-hidden="true" size={15} strokeWidth={2.4} />See projections</a>}
          </>
        )}
      </div>
    </Card>
  );
}

function Clarify({ c, onReply, disabled, showQuestion }: { c: Extract<UiCard, { type: 'clarify' }>; onReply: (t: string) => void; disabled: boolean; showQuestion: boolean }) {
  return (
    <div data-testid="card-clarify" className="pop flex flex-col gap-2">
      {showQuestion && c.question && <p className="max-w-[92%] rounded-[20px] rounded-bl-md border border-line bg-surface-2 px-4 py-3 text-[15px] leading-snug">{c.question}</p>}
      {!c.answered && c.chips.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Quick replies">
          {c.chips.map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => { markClarifyAnswered(c.id); onReply(ch); }}
              className={`${btn} border border-accent-2/40 bg-grad-primary-soft text-accent hover:brightness-95`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The source's domain. Grounding links are Google redirect URLs, so prefer a domain-like title. */
function domainOf(url: string, title?: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const t = (title ?? '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const titleIsDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t);
  if (/vertexaisearch|googleusercontent|google\.com$/.test(host) || !host) return titleIsDomain ? t : title?.trim() || host || 'Source';
  return host;
}

function timeLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(d);
}

function Research({ c, onPrefill }: { c: Extract<UiCard, { type: 'research_results' }>; onPrefill: (t: string) => void }) {
  return (
    <section data-testid="card-research" aria-label="Search results" className="pop rounded-[24px] border border-line bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${c.sample ? 'border border-line bg-surface-2 text-muted' : 'bg-grad-positive'}`}><WithIcon icon={c.sample ? 'deal' : Search} tone={c.sample ? 'neutral' : 'onGradient'} size={13}>{c.sample ? 'Student deals' : 'Live search'}</WithIcon></span>
        {c.retrievedAt && <WithIcon icon="time" tone="neutral" size={12} className="text-xs text-muted">Retrieved {timeLabel(c.retrievedAt)}</WithIcon>}
      </div>
      <p className="mt-2 text-xs font-semibold text-muted">{c.label ?? RESEARCH_LABEL}</p>
      {c.items.length === 0 && <p className="mt-3 text-sm">No results with a source came back. Try asking a different way.</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {c.items.map((it, i) => (
          <li key={`${it.ref ?? i}`} data-testid="research-item" className="rounded-[16px] border border-line bg-surface-2 p-3">
            <p className="text-sm font-bold">{it.provider}{it.product ? <span className="font-semibold text-muted"> · {it.product}</span> : null}</p>
            <div className="mt-1 flex items-center gap-2.5">
              <IconBadge icon={typeof it.ratePercent === 'number' ? 'percent' : 'deal'} tone="positive" size="sm" solid />
              <p className="font-display text-2xl font-extrabold text-pos num">{it.headline}</p>
            </div>
            {it.conditions.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">{it.conditions.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>
            )}
            <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-text underline underline-offset-4 hover:text-accent">
              {domainOf(it.sourceUrl, it.sourceTitle)}<span className="sr-only"> (source for {it.provider}, opens in a new tab)</span>
              <ExternalLink aria-hidden="true" size={13} strokeWidth={2.4} />
            </a>
            <div className="mt-2 flex flex-wrap gap-2">
              {typeof it.ratePercent === 'number' && (
                <button type="button" data-testid="use-in-projections" onClick={() => proposeRate({ provider: it.provider, headline: it.headline, ratePercent: it.ratePercent!, ref: it.ref })}
                  className={`${btnPrimary} px-4 text-xs`}>Use in projections</button>
              )}
              <button type="button" data-testid="apply-to-purchase"
                onClick={() => applyResearchDeal(it, onPrefill)}
                className={`${btnQuiet} px-4 text-xs`}>Apply deal to calendar</button>
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
          <div data-testid="card-error"><p className="text-[15px] leading-snug">{c.message}</p><p className="mt-1 text-xs text-muted">Your plan is untouched.</p></div>
        </Card>
      );
    case 'notice':
      return <p className="pop rounded-[16px] border border-line bg-surface-2 px-4 py-3 text-sm font-semibold">{c.text}</p>;
  }
}
