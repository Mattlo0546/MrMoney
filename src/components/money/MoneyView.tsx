'use client';
/**
 * /money: the Money agent (gemini-4-argon) researches live rates and funds, runs the allocation engine on the
 * user's profile, and the money map animates the reallocation. Profile and chat live in localStorage only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Landmark, RotateCcw, Search, Sparkles, TriangleAlert, Undo2 } from 'lucide-react';
import { useAppSnapshot } from '@/lib/store';
import type { EngineState } from '@/lib/engine/types';
import { allocate, formatPence } from '@/lib/finance/allocate';
import { DEFAULT_PROFILE, FinanceProfileSchema, type Allocation, type FinanceProfile, type MoneyCard, type MoneyMessage, type MoneyResponse, type MoneyStatus } from '@/lib/finance/types';
import { Button, Card, Spinner } from '@/components/ui';
import { allocationRows, currentRows, MoneyMap, ROW_ORDER, type RowKey } from './MoneyMap';

const KEY = 'studentplan:money:v1';
const GREETING = 'I\'m Money. I research live UK savings rates, ISA platforms and index funds, then split your spare cash with the allocation engine. Ask me where your money should go.';
const CHIPS = [
  'How should I split my spare money each month?',
  'Find me the best savings account right now',
  'Best way to start investing on my budget?',
  'Is my paid bank plan worth it?',
];

interface UiMessage { id: string; role: 'user' | 'assistant'; text: string; cards?: MoneyCard[]; notes?: string; }
interface Saved { profile: FinanceProfile; messages: UiMessage[]; allocation: Allocation | null; }

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Seed the money profile from the plan when the user hasn't told Money anything yet. */
function profileFromPlan(state: EngineState | null): FinanceProfile {
  if (!state) return DEFAULT_PROFILE;
  const bills = state.commitments.filter((c) => c.recurrence.kind === 'monthly').reduce((s, c) => s + c.amount.pence, 0);
  const food = state.profile.categories.filter((c) => c.essential).reduce((s, c) => s + (c.minimumDaily?.pence ?? 0) * 30, 0);
  const essentials = bills + food;
  return {
    ...DEFAULT_PROFILE,
    cashSavingsPence: state.profile.funds.pence,
    essentialMonthlyCostsPence: essentials > 0 ? essentials : DEFAULT_PROFILE.essentialMonthlyCostsPence,
  };
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<Saved>;
    const p = FinanceProfileSchema.safeParse(j.profile);
    if (!p.success) return null;
    return { profile: p.data, messages: Array.isArray(j.messages) ? j.messages : [], allocation: j.allocation ?? null };
  } catch {
    return null;
  }
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** Model-only summary of an assistant turn's cards (refs for compare_savings, the split it saw). */
function notesFor(cards: MoneyCard[]): string | undefined {
  const out: string[] = [];
  for (const c of cards) {
    if (c.type === 'research_results' && c.items.length) out.push(`Research refs: ${c.items.map((i) => `${i.ref}=${i.provider} ${i.product} ${i.headline}`).join('; ')}`);
    if (c.type === 'allocation') out.push(`Allocation: ${c.allocation.lines.map((l) => `${l.label} ${formatPence(l.pence)}`).join(', ')}`);
    if (c.type === 'comparison') out.push(`Comparison ${c.comparison.label}: ${formatPence(c.comparison.yearlyGainPence)}/yr, worth switching: ${c.comparison.worthSwitching}`);
  }
  return out.length ? out.join('\n').slice(0, 1500) : undefined;
}

async function callMoney(messages: MoneyMessage[], profile: FinanceProfile, today: string, onStatus: (s: MoneyStatus) => void): Promise<MoneyResponse> {
  const res = await fetch('/api/money', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ messages, profile, today, stream: true }),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream') || !res.body) return (await res.json()) as MoneyResponse;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let reply: MoneyResponse | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      if (!ev || !data) continue;
      try {
        const j = JSON.parse(data);
        if (ev === 'status') onStatus(j as MoneyStatus);
        if (ev === 'reply') reply = j as MoneyResponse;
      } catch { /* skip malformed event */ }
    }
  }
  if (!reply) throw new Error('No reply');
  return reply;
}

export function MoneyView() {
  const { hydrated, state, today } = useAppSnapshot();
  if (!hydrated) return <div className="grid min-h-[60vh] place-items-center"><Spinner size={28} /></div>;
  return <MoneyInner state={state} today={today} />;
}

function MoneyInner({ state, today }: { state: EngineState | null; today: string }) {
  const [saved] = useState<Saved | null>(() => load());
  const [profile, setProfile] = useState<FinanceProfile>(() => saved?.profile ?? profileFromPlan(state));
  const [messages, setMessages] = useState<UiMessage[]>(() => saved?.messages ?? []);
  const [allocation, setAllocation] = useState<Allocation | null>(() => saved?.allocation ?? null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<MoneyStatus | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [showCurrent, setShowCurrent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    save({ profile, messages, allocation });
  }, [profile, messages, allocation]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const keys = useMemo<RowKey[]>(() => {
    const set = new Set<RowKey>(currentRows(profile).map((r) => r.key));
    if (allocation) for (const r of allocationRows(allocation)) set.add(r.key);
    return ROW_ORDER.filter((k) => set.has(k));
  }, [profile, allocation]);
  const rows = useMemo(() => (allocation && !showCurrent ? allocationRows(allocation) : currentRows(profile)), [allocation, showCurrent, profile]);
  const mapTitle = allocation && !showCurrent ? 'Recommended split' : 'How it is now';

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const userMsg: UiMessage = { id: uid(), role: 'user', text: t };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);
    setStatus({ phase: 'thinking', label: 'Thinking…', step: 1 });
    const history: MoneyMessage[] = next.slice(-20).map((m) => ({ role: m.role, text: m.text, ...(m.notes ? { notes: m.notes } : {}) }));
    try {
      const reply = await callMoney(history, profile, today, setStatus);
      if (reply.profile) setProfile(reply.profile);
      const alloc = [...reply.cards].reverse().find((c) => c.type === 'allocation');
      if (alloc && alloc.type === 'allocation') {
        setShowCurrent(false);
        setAllocation(alloc.allocation);
        setAnimKey((k) => k + 1);
      }
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: reply.text, cards: reply.cards, notes: notesFor(reply.cards) }]);
    } catch {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: 'Sorry, I couldn\'t reach Money just now. Please try again.', cards: [{ id: uid(), type: 'error', message: 'Network error', retryable: true }] }]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }, [busy, messages, profile, today]);

  const replay = () => {
    if (!allocation) return;
    setShowCurrent(true);
    window.setTimeout(() => { setShowCurrent(false); setAnimKey((k) => k + 1); }, 900);
  };
  const runLocalSplit = () => {
    const a = allocate(profile, today);
    setShowCurrent(false);
    setAllocation(a);
    setAnimKey((k) => k + 1);
    setMessages((m) => [...m, { id: uid(), role: 'assistant', text: `Here's the split from the allocation engine for ${formatPence(a.monthlySurplusPence)} a month. Ask me why, or tell me what's changed.`, cards: [{ id: uid(), type: 'allocation', allocation: a }], notes: notesFor([{ id: 'x', type: 'allocation', allocation: a }]) }]);
  };
  const reset = () => {
    setMessages([]);
    setAllocation(null);
    setShowCurrent(false);
    setProfile(profileFromPlan(state));
  };

  const topCheck = allocation?.checks.find((c) => c.level === 'act') ?? allocation?.checks.find((c) => c.level === 'warn');

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 pb-24 pt-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
                <span className="grid size-9 place-items-center rounded-[12px] bg-grad-primary shadow-glow"><Landmark size={18} /></span>
                Money map
              </h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-9 px-4 text-sm" onClick={runLocalSplit} disabled={busy}><Sparkles size={14} /> Split my money</Button>
                {allocation && <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={replay} aria-label="Replay the reallocation animation"><RotateCcw size={14} /> Replay</Button>}
              </div>
            </div>
            <div key={`${mapTitle}-${animKey}`} className="mt-3 text-text">
              <MoneyMap rows={rows} keys={keys} surplusPence={allocation && !showCurrent ? allocation.monthlySurplusPence : profile.monthlySurplusPence} title={mapTitle} animKey={animKey} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted">
              <span className="rounded-full bg-surface-2 px-3 py-1">Savings {formatPence(profile.cashSavingsPence)} at {profile.cashRatePercent}%</span>
              <span className="rounded-full bg-surface-2 px-3 py-1">Spare {formatPence(profile.monthlySurplusPence)}/month</span>
              <span className="rounded-full bg-surface-2 px-3 py-1">Invested {formatPence(profile.investedPence)} +{formatPence(profile.monthlyInvestPence)}/month</span>
              <span className="rounded-full bg-surface-2 px-3 py-1">Crypto {formatPence(profile.cryptoPence)}</span>
              {profile.bankPlanFeeMonthlyPence > 0 && <span className="rounded-full bg-surface-2 px-3 py-1">Bank plan {formatPence(profile.bankPlanFeeMonthlyPence)}/month</span>}
            </div>
          </Card>
          {allocation && (
            <Card tone="raised">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-extrabold">Why this split</h2>
                {allocation.emergencyGapPence > 0 && <span className="rounded-full bg-pos-soft px-3 py-1 text-xs font-bold text-pos">Emergency fund {formatPence(allocation.emergencyGapPence)} to go{allocation.emergencyMonthsToFill ? ` · ${allocation.emergencyMonthsToFill} months` : ''}</span>}
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {allocation.lines.map((l) => (
                  <li key={l.bucket} className="rounded-[16px] bg-surface p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{l.label}</span><span className="num font-display text-lg font-extrabold">{formatPence(l.pence)}</span></div>
                    <p className="mt-1 text-xs text-muted">{l.reason}</p>
                  </li>
                ))}
              </ul>
              {topCheck && (
                <div className={`mt-3 flex gap-2 rounded-[16px] p-3 text-sm ${topCheck.level === 'act' ? 'bg-warn-soft text-warn' : 'bg-surface'}`}>
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <div><p className="font-bold">{topCheck.title}{typeof topCheck.yearlyPence === 'number' && topCheck.yearlyPence !== 0 ? ` · ${formatPence(topCheck.yearlyPence)}/yr` : ''}</p><p className="text-xs opacity-90">{topCheck.detail}</p></div>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">{allocation.note} General information, not financial advice.</p>
            </Card>
          )}
        </div>

        <Card className="flex min-h-[70vh] flex-col p-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-grad-primary px-3 py-1 text-xs font-bold shadow-glow"><Search size={13} /> Money · Gemini 4 Argon</span>
            <button type="button" onClick={reset} className="inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-bold text-muted hover:bg-surface-2"><Undo2 size={13} /> Reset</button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              <Bubble role="assistant">{GREETING}</Bubble>
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-2">
                  <Bubble role={m.role}>{m.text}</Bubble>
                  {m.cards?.map((c) => <MoneyCardView key={c.id} c={c} onReply={send} />)}
                </div>
              ))}
              {status && (
                <div className="flex items-center gap-2 text-sm font-semibold text-muted" aria-live="polite">
                  <Spinner size={16} /> {status.label}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-line p-3">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {CHIPS.map((c) => (
                <button key={c} type="button" disabled={busy} onClick={() => send(c)} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold hover:border-line-strong disabled:opacity-50">{c}</button>
              ))}
            </div>
            <form className="flex items-center gap-2 rounded-full border border-line bg-surface p-1 pl-4 focus-within:border-accent" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. I have £250 spare a month and £3,900 saved"
                aria-label="Message Money"
                className="min-h-10 flex-1 bg-transparent text-sm outline-none"
                disabled={busy}
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-grad-primary shadow-glow disabled:opacity-50"><ArrowRight size={16} /></button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: string }) {
  return (
    <div className={`max-w-[92%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-sm ${role === 'user' ? 'self-end bg-grad-primary' : 'self-start bg-surface-2'}`}>{children}</div>
  );
}

function domainOf(url: string, title?: string): string {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
  if (!host || /vertexaisearch|googleusercontent|google\.com$/.test(host)) return title?.trim() || host || 'Source';
  return host;
}

function MoneyCardView({ c, onReply }: { c: MoneyCard; onReply: (t: string) => void }) {
  switch (c.type) {
    case 'research_results':
      return (
        <section aria-label="Search results" className="rounded-[20px] border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.sample ? 'bg-bg text-muted' : 'bg-lime-fill text-[#0B0C1F]'}`}>{c.sample ? 'Sample offers' : 'Live search'}</span>
            <span className="text-xs text-muted">{c.label}</span>
          </div>
          {c.items.length === 0 && <p className="mt-2 text-sm">No results with a source came back.</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {c.items.slice(0, 5).map((it) => (
              <li key={it.ref} className="rounded-[14px] bg-bg p-3">
                <p className="text-sm font-bold">{it.provider}{it.product ? <span className="font-semibold text-muted"> · {it.product}</span> : null}</p>
                <p className="num font-display text-xl font-extrabold text-lime">{it.headline}</p>
                {it.conditions.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{it.conditions.slice(0, 2).map((x) => <li key={x}>{x}</li>)}</ul>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline underline-offset-4">{domainOf(it.sourceUrl, it.sourceTitle)}</a>
                  {typeof it.ratePercent === 'number' && (
                    <button type="button" onClick={() => onReply(`Is it worth moving my savings to ${it.provider} ${it.product} at ${it.ratePercent}% (ref ${it.ref})?`)} className="rounded-full border border-line px-3 py-1 text-xs font-bold hover:border-line-strong">Worth switching?</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'allocation':
      return (
        <section aria-label="Allocation" className="rounded-[20px] border border-line bg-surface-2 p-3">
          <p className="text-xs font-bold text-muted">Monthly split · {formatPence(c.allocation.monthlySurplusPence)}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {c.allocation.lines.map((l) => <li key={l.bucket} className="flex justify-between text-sm"><span>{l.label}</span><span className="num font-bold">{formatPence(l.pence)}</span></li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">Shown on the money map.</p>
        </section>
      );
    case 'comparison': {
      const g = c.comparison;
      return (
        <section aria-label="Comparison" className={`rounded-[20px] border border-line p-3 ${g.worthSwitching ? 'bg-pos-soft' : 'bg-surface-2'}`}>
          <p className="text-sm font-bold">{g.label}</p>
          <p className={`num font-display text-2xl font-extrabold ${g.yearlyGainPence >= 0 ? 'text-pos' : 'text-neg'}`}>{g.yearlyGainPence >= 0 ? '+' : ''}{formatPence(g.yearlyGainPence)}/yr</p>
          <p className="text-xs text-muted">{g.fromRatePercent}% → {g.toRatePercent}% on {formatPence(g.balancePence)}. {g.detail}</p>
          <p className="mt-1 text-xs font-bold">{g.worthSwitching ? 'Worth switching.' : 'Not worth the hassle.'}</p>
        </section>
      );
    }
    case 'profile_updated':
      return <p className="text-xs font-semibold text-muted">Saved: {c.fields.join(', ')}</p>;
    case 'clarify':
      return (
        <div className="flex flex-wrap gap-2">
          {c.chips.map((ch) => <button key={ch} type="button" onClick={() => onReply(ch)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold hover:border-line-strong">{ch}</button>)}
        </div>
      );
    case 'error':
      return <p className="rounded-[14px] bg-neg-soft px-3 py-2 text-xs font-semibold text-neg">{c.message}</p>;
    default:
      return null;
  }
}
