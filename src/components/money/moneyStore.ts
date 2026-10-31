'use client';
/**
 * External store for the /money agent (gemini-4-argon) using useSyncExternalStore.
 * Keeps in-flight requests, streaming status, draft input, profile, allocation, and
 * chat history alive across route and tab changes, persisting immediately to localStorage.
 */
import { useSyncExternalStore } from 'react';
import { getAppStore } from '@/lib/store';
import type { EngineState } from '@/lib/engine/types';
import { allocate, formatPence } from '@/lib/finance/allocate';
import {
  DEFAULT_PROFILE,
  FinanceProfileSchema,
  type Allocation,
  type FinanceProfile,
  type MoneyCard,
  type MoneyMessage,
  type MoneyResponse,
  type MoneyStatus,
} from '@/lib/finance/types';

export const MONEY_STORAGE_KEY = 'mrmoney:money:v1';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: MoneyCard[];
  notes?: string;
}

interface Saved {
  profile: FinanceProfile;
  messages: UiMessage[];
  allocation: Allocation | null;
}

export interface MoneyState {
  hydrated: boolean;
  profile: FinanceProfile;
  messages: UiMessage[];
  allocation: Allocation | null;
  draft: string;
  busy: boolean;
  status: MoneyStatus | null;
  animKey: number;
  showCurrent: boolean;
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Seed the money profile from the plan when the user hasn't told Money anything yet. */
export function profileFromPlan(state: EngineState | null): FinanceProfile {
  if (!state) return DEFAULT_PROFILE;
  const bills = state.commitments
    .filter((c) => c.recurrence.kind === 'monthly')
    .reduce((s, c) => s + c.amount.pence, 0);
  const food = state.profile.categories
    .filter((c) => c.essential)
    .reduce((s, c) => s + (c.minimumDaily?.pence ?? 0) * 30, 0);
  const essentials = bills + food;
  return {
    ...DEFAULT_PROFILE,
    cashSavingsPence: state.profile.funds.pence,
    essentialMonthlyCostsPence: essentials > 0 ? essentials : DEFAULT_PROFILE.essentialMonthlyCostsPence,
  };
}

function load(): Saved | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(MONEY_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<Saved>;
    const p = FinanceProfileSchema.safeParse(j.profile);
    if (!p.success) return null;
    return {
      profile: p.data,
      messages: Array.isArray(j.messages) ? j.messages : [],
      allocation: j.allocation ?? null,
    };
  } catch {
    return null;
  }
}

function save(s: Saved) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MONEY_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Model-only summary of an assistant turn's cards (refs for compare_savings, the split it saw). */
export function notesFor(cards: MoneyCard[]): string | undefined {
  const out: string[] = [];
  for (const c of cards) {
    if (c.type === 'research_results' && c.items.length) {
      out.push(`Research refs: ${c.items.map((i) => `${i.ref}=${i.provider} ${i.product} ${i.headline}`).join('; ')}`);
    }
    if (c.type === 'allocation') {
      out.push(`Allocation: ${c.allocation.lines.map((l) => `${l.label} ${formatPence(l.pence)}`).join(', ')}`);
    }
    if (c.type === 'comparison') {
      out.push(
        `Comparison ${c.comparison.label}: ${formatPence(c.comparison.yearlyGainPence)}/yr, worth switching: ${c.comparison.worthSwitching}`,
      );
    }
  }
  return out.length ? out.join('\n').slice(0, 1500) : undefined;
}

async function callMoney(
  messages: MoneyMessage[],
  profile: FinanceProfile,
  today: string,
  onStatus: (s: MoneyStatus) => void,
): Promise<MoneyResponse> {
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
      } catch {
        /* skip malformed event */
      }
    }
  }
  if (!reply) throw new Error('No reply');
  return reply;
}

const EMPTY_STATE: MoneyState = {
  hydrated: false,
  profile: DEFAULT_PROFILE,
  messages: [],
  allocation: null,
  draft: '',
  busy: false,
  status: null,
  animKey: 0,
  showCurrent: false,
};

let state: MoneyState = EMPTY_STATE;
const listeners = new Set<() => void>();

function setMoney(patch: Partial<MoneyState>, persist = false) {
  state = { ...state, ...patch };
  if (persist) {
    save({
      profile: state.profile,
      messages: state.messages,
      allocation: state.allocation,
    });
  }
  listeners.forEach((l) => l());
}

export function hydrateMoney(planState?: EngineState | null): MoneyState {
  if (state.hydrated || typeof window === 'undefined') return state;
  const saved = load();
  const fallbackPlan = planState !== undefined ? planState : getAppStore().getSnapshot().state;
  const profile = saved?.profile ?? profileFromPlan(fallbackPlan);
  const messages = saved?.messages ?? [];
  const allocation = saved?.allocation ?? null;
  state = {
    ...state,
    hydrated: true,
    profile,
    messages,
    allocation,
  };
  save({ profile, messages, allocation });
  return state;
}

export function getMoneySnapshot(): MoneyState {
  hydrateMoney();
  return state;
}

export function subscribeMoney(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMoneyStore(planState?: EngineState | null): MoneyState {
  if (!state.hydrated && typeof window !== 'undefined') {
    hydrateMoney(planState);
  }
  return useSyncExternalStore(subscribeMoney, getMoneySnapshot, () => EMPTY_STATE);
}

export function setMoneyDraft(draft: string) {
  hydrateMoney();
  setMoney({ draft });
}

export async function sendMoneyMessage(rawText: string, todayOverride?: string): Promise<void> {
  const t = rawText.trim();
  hydrateMoney();
  if (!t || state.busy) return;

  const today = todayOverride ?? getAppStore().getSnapshot().today;
  const userMsg: UiMessage = { id: uid(), role: 'user', text: t };
  const nextMessages = [...state.messages, userMsg];
  const currentProfile = state.profile;

  setMoney(
    {
      messages: nextMessages,
      draft: '',
      busy: true,
      status: { phase: 'thinking', label: 'Thinking…', step: 1 },
    },
    true,
  );

  const history: MoneyMessage[] = nextMessages
    .slice(-20)
    .map((m) => ({ role: m.role, text: m.text, ...(m.notes ? { notes: m.notes } : {}) }));

  try {
    const reply = await callMoney(history, currentProfile, today, (s) => setMoney({ status: s }));
    const nextProfile = reply.profile ?? state.profile;
    const alloc = [...reply.cards].reverse().find((c) => c.type === 'allocation');
    const assistantMsg: UiMessage = {
      id: uid(),
      role: 'assistant',
      text: reply.text,
      cards: reply.cards,
      notes: notesFor(reply.cards),
    };

    setMoney(
      {
        profile: nextProfile,
        ...(alloc && alloc.type === 'allocation'
          ? {
              showCurrent: false,
              allocation: alloc.allocation,
              animKey: state.animKey + 1,
            }
          : {}),
        messages: [...state.messages, assistantMsg],
      },
      true,
    );
  } catch {
    const errMsg: UiMessage = {
      id: uid(),
      role: 'assistant',
      text: "Sorry, I couldn't reach Money just now. Please try again.",
      cards: [{ id: uid(), type: 'error', message: 'Network error', retryable: true }],
    };
    setMoney({ messages: [...state.messages, errMsg] }, true);
  } finally {
    setMoney({ busy: false, status: null });
  }
}

let replayTimer: ReturnType<typeof setTimeout> | null = null;

export function replayMoneyAnimation() {
  hydrateMoney();
  if (!state.allocation) return;
  if (replayTimer) clearTimeout(replayTimer);
  setMoney({ showCurrent: true });
  replayTimer = setTimeout(() => {
    setMoney({ showCurrent: false, animKey: state.animKey + 1 });
    replayTimer = null;
  }, 900);
}

export function runMoneyLocalSplit(todayOverride?: string) {
  hydrateMoney();
  if (state.busy) return;
  const today = todayOverride ?? getAppStore().getSnapshot().today;
  const a = allocate(state.profile, today);
  const card: MoneyCard = { id: uid(), type: 'allocation', allocation: a };
  const msg: UiMessage = {
    id: uid(),
    role: 'assistant',
    text: `Here's the split from the allocation engine for ${formatPence(a.monthlySurplusPence)} a month. Ask me why, or tell me what's changed.`,
    cards: [card],
    notes: notesFor([card]),
  };
  setMoney(
    {
      showCurrent: false,
      allocation: a,
      animKey: state.animKey + 1,
      messages: [...state.messages, msg],
    },
    true,
  );
}

export function resetMoneyStore(planState?: EngineState | null) {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
  const fallbackPlan = planState !== undefined ? planState : getAppStore().getSnapshot().state;
  const nextProfile = profileFromPlan(fallbackPlan);
  setMoney(
    {
      hydrated: true,
      profile: nextProfile,
      messages: [],
      allocation: null,
      draft: '',
      busy: false,
      status: null,
      showCurrent: false,
    },
    true,
  );
}
