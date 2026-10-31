'use client';
/**
 * Chat store (external store, useSyncExternalStore). Runs one chat turn:
 *   user text -> POST /api/chat -> (tool_calls -> execute via engine/store -> POST toolResults)* -> reply.
 * Falls back to the deterministic /api/parse path when /api/chat is unavailable ("offline mode").
 */
import { useSyncExternalStore } from 'react';
import { explain } from '@/lib/engine';
import type { Intent } from '@/lib/engine';
import { getAppStore } from '@/lib/store';
import type { Card, ChatMessage, ChatResponse, ClientToolCall, ToolResult } from '@/lib/agent/types';
import { RESEARCH_LABEL, SAMPLE_LABEL } from '@/lib/agent/types';
import type { ParseResult } from '@/lib/parser/types';
import type { PreviewData } from '@/components/plan/change/changeState';
import { clarifyChips } from '@/components/plan/change/cards';
import { applyPreview, buildContext, confirmRate, executeCall, undoChange } from './bridge';
import { clearHistory, HISTORY_LIMIT, loadHistory, saveHistory } from './history';
import { newId, type Phase, type UiCard, type UiMessage } from './model';

export interface ChatState {
  hydrated: boolean;
  messages: UiMessage[];
  draft: string;
  phase: Phase;
  /** Free-text status from the server stream (e.g. "Searching the web… (step 2)"). */
  statusLabel: string;
  busy: boolean;
  offline: boolean;
  /** Increments when a fresh plan is created by chat (drives the plan-entrance animation). */
  planCreatedAt: number;
  /** Milliseconds the last turn took (for QA/timing). */
  lastTurnMs: number | null;
}

const EMPTY: ChatState = { hydrated: false, messages: [], draft: '', phase: 'idle', statusLabel: '', busy: false, offline: false, planCreatedAt: 0, lastTurnMs: null };
let state: ChatState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<ChatState>, persist = false) {
  state = { ...state, ...patch };
  if (persist) saveHistory(state.messages);
  listeners.forEach((l) => l());
}

function hydrate() {
  if (state.hydrated || typeof window === 'undefined') return;
  state = { ...state, hydrated: true, messages: loadHistory() };
}

export const getChat = (): ChatState => {
  hydrate();
  return state;
};
export function subscribeChat(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useChat(): ChatState {
  return useSyncExternalStore(subscribeChat, getChat, () => EMPTY);
}

const now = () => new Date().toISOString();

function push(m: Omit<UiMessage, 'id' | 'at'> & { id?: string }): string {
  const msg: UiMessage = { id: m.id ?? newId('m'), at: now(), ...m } as UiMessage;
  set({ messages: [...state.messages, msg].slice(-HISTORY_LIMIT) }, true);
  return msg.id;
}

function patchMessage(id: string, fn: (m: UiMessage) => UiMessage) {
  set({ messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) }, true);
}

function patchCard(cardId: string, fn: (c: UiCard) => UiCard) {
  set({
    messages: state.messages.map((m) => (m.cards?.some((c) => c.id === cardId) ? { ...m, cards: m.cards.map((c) => (c.id === cardId ? fn(c) : c)) } : m)),
  }, true);
}

export function findCard(cardId: string): UiCard | undefined {
  for (const m of state.messages) for (const c of m.cards ?? []) if (c.id === cardId) return c;
  return undefined;
}

export function setDraft(draft: string) {
  set({ draft });
}

export function newChat() {
  if (state.busy) return;
  clearHistory();
  set({ messages: [], draft: '', phase: 'idle', statusLabel: '' });
}

/** Complete reset for app reset / demo restart (ignores busy guard). */
export function resetChat() {
  clearHistory();
  set({ messages: [], draft: '', phase: 'idle', statusLabel: '', busy: false });
}

// ------------------------------------------------------------------ wire format

function cardSummary(c: UiCard): string {
  switch (c.type) {
    case 'plan_created': return '[Plan created and shown to the user]';
    case 'change_applied': return `[Applied change #${c.changeId}${c.undone ? ', later undone' : ''}: ${c.explanation.sentence}]`;
    case 'preview': return `[Preview "${c.title}" ${c.state === 'open' ? 'shown, awaiting the user' : c.state === 'applied' ? 'APPLIED by the user' : c.state === 'discarded' ? 'discarded by the user' : 'expired'}]`;
    case 'confirm': return `[Confirm "${c.title}" ${c.state === 'applied' ? 'CONFIRMED by the user' : c.state === 'open' ? 'awaiting the user' : c.state}]`;
    case 'clarify': return `[Asked: ${c.question}]`;
    case 'research_results': return `[Research results shown: ${c.items.map((i) => `${i.provider} ${i.headline}${i.ref ? ` (ref ${i.ref})` : ''}`).join('; ')}]`;
    case 'error': return `[Error shown: ${c.message}]`;
    case 'notice': return `[${c.text}]`;
  }
}

function toWire(m: UiMessage): ChatMessage {
  const cards: Card[] = [];
  for (const c of m.cards ?? []) {
    if (c.type === 'research_results' && c.raw) cards.push(c.raw as Card);
    if (c.type === 'change_applied' && c.diff) cards.push({ id: c.id, type: 'change_applied', changeId: String(c.changeId), explanation: c.explanation.sentence });
  }
  const extra = (m.cards ?? []).filter((c) => c.type !== 'research_results').map(cardSummary).join(' ');
  const text = [m.text, extra].filter(Boolean).join('\n').slice(0, 3900) || '(no text)';
  return { id: m.id.slice(0, 80), role: m.role, text, ...(cards.length ? { cards: cards.slice(0, 10) } : {}) };
}

function wireMessages(): ChatMessage[] {
  const list = state.messages.filter((m) => !m.localOnly).slice(-40).map(toWire);
  // The model expects a user turn first.
  while (list.length && list[0].role !== 'user') list.shift();
  return list;
}

// ------------------------------------------------------------------ server cards -> UI cards

function fromServer(c: Card): UiCard | null {
  switch (c.type) {
    case 'clarify': return { type: 'clarify', id: c.id || newId('q'), question: c.question, chips: c.chips ?? [] };
    case 'error': return { type: 'error', id: c.id || newId('e'), message: c.message };
    case 'research_results':
      return {
        type: 'research_results', id: c.id || newId('r'), topic: c.topic, query: c.query, retrievedAt: c.retrievedAt, sample: c.sample,
        label: c.label || (c.sample ? SAMPLE_LABEL : RESEARCH_LABEL),
        items: (c.items ?? []).filter((i) => !!i.sourceUrl).map((i) => ({
          ref: i.ref, provider: i.provider, product: i.product, headline: i.headline, ratePercent: i.ratePercent,
          conditions: i.conditions ?? [], sourceUrl: i.sourceUrl, sourceTitle: i.sourceTitle,
        })),
        raw: c,
      };
    // plan_created / change_applied / preview are client-generated from engine output; ignore server copies.
    default: return null;
  }
}

// ------------------------------------------------------------------ transport

class ChatUnavailable extends Error {}

async function postChat(body: unknown, onStatus: (phase: 'thinking' | 'researching', label: string) => void, signal: AbortSignal): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ ...(body as object), stream: true }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ChatUnavailable('network');
  }
  if (res.status === 404 || res.status >= 500 && res.status !== 504) throw new ChatUnavailable(`http ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final: ChatResponse | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (ev === 'status') {
            const s = parsed as { phase: 'thinking' | 'researching'; label: string };
            onStatus(s.phase, s.label);
          } else if (ev === 'tool_calls' || ev === 'reply') {
            final = parsed as ChatResponse;
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }
    if (!final) throw new ChatUnavailable('stream ended without a result');
    return final;
  }
  let json: ChatResponse;
  try {
    json = (await res.json()) as ChatResponse;
  } catch {
    throw new ChatUnavailable('bad json');
  }
  if (!json || (json.kind !== 'reply' && json.kind !== 'tool_calls')) throw new ChatUnavailable('bad shape');
  return json;
}

/** A reply that says the model isn't configured / reachable counts as offline. */
function looksUnavailable(r: ChatResponse): boolean {
  if (r.kind !== 'reply' || r.phase !== 'error') return false;
  const text = [r.text, ...r.cards.map((c) => (c.type === 'error' ? c.message : ''))].join(' ').toLowerCase();
  return /(api key|no key|not configured|unavailable|offline|gemini_api_key|couldn.t reach|could not reach)/.test(text);
}

// ------------------------------------------------------------------ turn

let controller: AbortController | null = null;

export async function sendMessage(raw: string): Promise<void> {
  const text = raw.trim().slice(0, 2000);
  if (!text || state.busy) return;
  getChat();
  push({ role: 'user', text });
  const started = performance.now();
  set({ draft: '', busy: true, phase: 'thinking', statusLabel: '' });
  controller = new AbortController();
  const hadPlan = !!getAppStore().getSnapshot().state;
  try {
    await runTurn(text, controller.signal);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      console.warn('[chat] turn failed', e);
      if (e instanceof ChatUnavailable) await offlineTurn(text, true);
      else push({ role: 'assistant', text: '', cards: [{ type: 'error', id: newId('e'), message: 'Something went wrong, and nothing was changed. Please try again.' }] });
    }
  } finally {
    const created = !hadPlan && !!getAppStore().getSnapshot().state;
    set({ busy: false, phase: 'idle', statusLabel: '', lastTurnMs: Math.round(performance.now() - started), ...(created ? { planCreatedAt: Date.now() } : {}) });
    controller = null;
  }
}

export function stopTurn() {
  controller?.abort();
}

async function runTurn(text: string, signal: AbortSignal, retried = false): Promise<void> {
  const messages = wireMessages();
  let toolResults: ToolResult[] | undefined;
  let modelState: string | undefined;
  let turnMsgId: string | null = null;
  const addCards = (cards: UiCard[], draft?: string) => {
    if (!cards.length && !draft) return;
    if (!turnMsgId) turnMsgId = push({ role: 'assistant', text: draft ?? '', cards });
    else patchMessage(turnMsgId, (m) => ({ ...m, text: draft ? draft : m.text, cards: [...(m.cards ?? []), ...cards] }));
  };

  let resent = false;
  for (let step = 0; step < 9; step++) {
    const snap = getAppStore().getSnapshot();
    const body = { messages, context: buildContext(snap), ...(toolResults ? { toolResults, modelState } : {}) };
    const onStatus = (phase: 'thinking' | 'researching', label: string) => set({ phase: phase === 'researching' ? 'searching' : 'thinking', statusLabel: label });
    let resp = await postChat(body, onStatus, signal);
    // Continuation failed transiently: resend the identical request once (the server replays; tools are not re-run).
    if (resp.kind === 'reply' && resp.phase === 'error' && toolResults && !resent
      && resp.cards.some((c) => c.type === 'error' && c.retryable && !/send (it|that|your message)? ?again/i.test(c.message))) {
      resent = true;
      resp = await postChat(body, onStatus, signal);
    }
    if (step === 0 && looksUnavailable(resp)) throw new ChatUnavailable('model unavailable');
    if (state.offline) set({ offline: false });

    const serverCards = (resp.cards ?? []).map(fromServer).filter((c): c is UiCard => !!c);

    if (resp.kind === 'reply') {
      // Expired/tampered modelState: resend the user's message once without tool results.
      // Invalid/expired modelState ("send again"): resend the user's message without tool results, but only
      // when nothing was committed this turn (otherwise the model could repeat an applied change).
      const committed = !!turnMsgId && (state.messages.find((m) => m.id === turnMsgId)?.cards ?? []).some((c) => c.type === 'change_applied' || c.type === 'plan_created');
      const retry = resp.phase === 'error' && toolResults && !retried && !committed
        && resp.cards.some((c) => c.type === 'error' && /send (it|that|your message)? ?again/i.test(c.message));
      if (retry) return runTurn(text, signal, true);
      // Autonomously apply findable student deals to existing planned expenses when deal research completes and a plan exists
      const hasDealResearch = (resp.cards ?? []).some(
        (c) => c.type === 'research_results' && (c.topic === 'student_deals' || c.topic === 'cheap_food' || c.topic === 'transport_savings'),
      );
      if (hasDealResearch && snap.state && !committed) {
        const autoDeal = executeCall({
          id: newId('auto-deal'),
          name: 'apply_deal',
          args: { category: 'all', percentOff: 25, dealRef: 'all' },
        });
        if (autoDeal.result.ok && autoDeal.cards.length) {
          serverCards.push(...autoDeal.cards);
        }
      }
      // Don't repeat a message that a card already shows (error text, clarify question).
      const dup = serverCards.some((c) => (c.type === 'error' && c.message.trim() === resp.text.trim()));
      const replyText = dup ? '' : resp.text;
      if (turnMsgId) patchMessage(turnMsgId, (m) => ({ ...m, text: replyText || m.text, cards: [...(m.cards ?? []), ...serverCards] }));
      else push({ role: 'assistant', text: replyText, cards: serverCards });
      return;
    }

    // tool_calls: run each on the engine, show its card, then post the results back.
    set({ phase: 'updating', statusLabel: '' });
    const results: ToolResult[] = [];
    const cards: UiCard[] = [...serverCards];
    for (const call of resp.calls as ClientToolCall[]) {
      let ex;
      try {
        ex = executeCall(call);
      } catch (e) {
        ex = { result: { id: call.id, name: call.name, ok: false, error: e instanceof Error ? e.message : 'Tool failed' } as ToolResult, cards: [] as UiCard[] };
      }
      results.push(ex.result);
      cards.push(...ex.cards);
    }
    addCards(cards, resp.assistantDraft);
    toolResults = results;
    modelState = resp.modelState;
    set({ phase: 'thinking', statusLabel: '' });
  }
  addCards([{ type: 'error', id: newId('e'), message: 'That took too many steps, so I stopped. Your plan shows every change that was made.' }]);
}

// ------------------------------------------------------------------ offline fallback (/api/parse + store)

const OFFLINE = "I'm in offline mode, so I'm using the simple reader.";

async function offlineTurn(text: string, announce: boolean): Promise<void> {
  set({ offline: true, phase: 'offline' });
  const store = getAppStore();
  const snap = store.getSnapshot();
  const lead = announce ? `${OFFLINE} ` : '';
  if (!snap.state) {
    push({
      role: 'assistant', localOnly: true,
      text: `${lead}I can't set up a plan by chat without the assistant. Try the demo student, or come back when I'm online.`,
      cards: [{ type: 'clarify', id: newId('q'), question: 'Want to look around first?', chips: ['Try a demo student'] }],
    });
    return;
  }
  let result: ParseResult;
  try {
    const res = await fetch('/api/parse', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, today: snap.today, demoMode: snap.demoActive, categories: snap.state.profile.categories.map((c) => ({ id: c.id, name: c.name })) }),
    });
    result = (await res.json()) as ParseResult;
  } catch {
    push({ role: 'assistant', localOnly: true, text: `${lead}I couldn't read that right now. Nothing was changed.`, cards: [] });
    return;
  }
  if (result.kind === 'error') {
    push({ role: 'assistant', localOnly: true, text: `${lead}${result.message}`, cards: [] });
    return;
  }
  if (result.kind === 'clarify') {
    const cats = snap.state.profile.categories.map((c) => c.name);
    const bills = snap.state.commitments.map((c) => c.name);
    push({ role: 'assistant', localOnly: true, text: lead.trim(), cards: [{ type: 'clarify', id: newId('q'), question: result.question, chips: clarifyChips(result.missing, cats, bills) }] });
    return;
  }
  const key = `offline-${newId('k')}`;
  const intent = { ...result.intent, idempotencyKey: key } as Intent;
  const immediate = intent.kind === 'expense' || intent.kind === 'income' || intent.kind === 'preference';
  if (immediate) {
    const out = store.apply(intent, key);
    if (!out.ok) {
      push({ role: 'assistant', localOnly: true, text: `${lead}${out.needsClarification?.question ?? out.error?.message ?? 'That could not be applied.'}`, cards: [] });
      return;
    }
    push({
      role: 'assistant', localOnly: true, text: `${lead}Done.`,
      cards: [{ type: 'change_applied', id: newId('c'), intent, diff: out.diff ?? null, changeId: out.changeId, noop: out.noop || !out.diff, explanation: out.diff ? explain(out.diff) : { facts: [], sentence: 'Nothing changed.' } }],
    });
    return;
  }
  const pv = store.preview(intent) as PreviewData | null;
  const aff = pv?.affordability;
  if (!pv || (!pv.ok && !(aff && !aff.fits))) {
    const msg = pv && !pv.ok ? pv.needsClarification?.question ?? pv.error?.message : undefined;
    push({ role: 'assistant', localOnly: true, text: `${lead}${msg ?? 'That could not be previewed.'}`, cards: [] });
    return;
  }
  push({
    role: 'assistant', localOnly: true, text: `${lead}Here's what would change. Nothing is saved until you tap Apply.`,
    cards: [{ type: 'preview', id: newId('p'), tool: 'offline', title: 'Preview', intent, pv, chosenOptionId: null, state: 'open' }],
  });
}

// ------------------------------------------------------------------ card actions

export function chooseOption(cardId: string, optionId: string) {
  patchCard(cardId, (c) => (c.type === 'preview' ? { ...c, chosenOptionId: optionId } : c));
}

function reportFailure(message: string) {
  push({ role: 'assistant', text: '', localOnly: true, cards: [{ type: 'error', id: newId('e'), message }] });
}

export function applyCard(cardId: string) {
  const c = findCard(cardId);
  if (!c || c.type !== 'preview') return;
  const out = applyPreview(c);
  if (!out.ok) return reportFailure(out.message);
  patchCard(cardId, () => out.card);
  push({ role: 'assistant', text: out.text, cards: out.followUp ? [out.followUp] : [] });
}

export function discardCard(cardId: string) {
  patchCard(cardId, (c) => (c.type === 'preview' || c.type === 'confirm' ? { ...c, state: 'discarded', ...(c.type === 'preview' ? { pv: null } : {}) } : c));
}

export function confirmCard(cardId: string) {
  const c = findCard(cardId);
  if (!c || c.type !== 'confirm') return;
  const out = confirmRate(c);
  if (!out.ok) return reportFailure(out.message);
  patchCard(cardId, () => out.card);
  push({ role: 'assistant', text: out.text, cards: [] });
}

export function undoCard(cardId: string) {
  const c = findCard(cardId);
  if (!c || c.type !== 'change_applied') return;
  const out = undoChange(c);
  if (!out.ok) return reportFailure(out.message);
  patchCard(cardId, () => out.card);
  push({ role: 'assistant', text: out.text, cards: [] });
}

/** "Use in projections" on a research item: a local confirm card (no model round-trip needed). */
export function proposeRate(item: { provider: string; headline: string; ratePercent: number; ref?: string }, bucket: 'savings' | 'investments' = 'savings') {
  const ex = executeCall({ id: newId('local'), name: 'use_rate_in_projections', args: { bucket, ratePercent: item.ratePercent, sourceRef: item.ref ?? item.provider } });
  push({ role: 'assistant', text: `Use ${item.provider}'s ${item.headline} as your base ${bucket} rate in projections?`, cards: ex.cards });
}

/** "Apply deal" on a research item: immediately applies the deal discount to matching expenses on the calendar if a plan exists. */
export function applyResearchDeal(
  item: { provider: string; product?: string; headline: string; percentOff?: number; ref?: string },
  onPrefill?: (t: string) => void,
) {
  const snap = getAppStore().getSnapshot();
  if (!snap.state) {
    onPrefill?.(`Apply the ${item.provider} deal (${item.headline}${item.ref ? `, ref ${item.ref}` : ''}) to my planned `);
    return;
  }
  const ex = executeCall({
    id: newId('local'),
    name: 'apply_deal',
    args: {
      plannedPurchaseLabel: `${item.provider}${item.product && item.product !== item.provider ? ` ${item.product}` : ''}`.slice(0, 60),
      category: 'eating-out',
      percentOff: item.percentOff && item.percentOff > 0 ? item.percentOff : 20,
      dealRef: item.ref ?? item.provider,
    },
  });
  if (ex.result.ok && ex.cards.length) {
    const resObj = (ex.result.result ?? {}) as { explanation?: string };
    push({ role: 'assistant', text: resObj.explanation ?? `Applied ${item.provider} (${item.headline}) to your calendar.`, cards: ex.cards });
  } else {
    onPrefill?.(`Apply the ${item.provider} deal (${item.headline}${item.ref ? `, ref ${item.ref}` : ''}) to my planned `);
  }
}

export function markClarifyAnswered(cardId: string) {
  patchCard(cardId, (c) => (c.type === 'clarify' ? { ...c, answered: true } : c));
}

/** The most recent open preview (drives the calendar's dashed preview chips). */
export function useOpenPreview(): Extract<UiCard, { type: 'preview' }> | null {
  const s = useChat();
  for (let i = s.messages.length - 1; i >= 0; i--) {
    const cards = s.messages[i].cards ?? [];
    for (let j = cards.length - 1; j >= 0; j--) {
      const c = cards[j];
      if (c.type === 'preview' && c.state === 'open' && c.pv) return c;
    }
  }
  return null;
}

/** "Try a demo student": instant and works offline (no model round-trip). */
export function startDemoLocal(label = 'Try a demo student') {
  if (state.busy) return;
  getChat();
  push({ role: 'user', text: label });
  const ex = executeCall({ id: newId('local'), name: 'start_demo', args: {} });
  push({
    role: 'assistant',
    text: "Meet our demo student: £3,900 to last until 31 Jan, rent £620 on the 1st. It's Tue 10 Nov in the demo. Try \"I spent £35 on a shower filter today\" or \"Can I spend £20 on dinner tomorrow?\"",
    cards: ex.cards,
  });
  set({ draft: '', planCreatedAt: Date.now() });
}

/** Keep the greeting in the history once the conversation starts (not sent to the model). */
export function addOpening(text: string) {
  getChat();
  if (state.messages.length === 0) push({ role: 'assistant', text, localOnly: true });
}
