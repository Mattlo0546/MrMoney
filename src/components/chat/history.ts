'use client';
/** Chat history persistence: the last 50 messages in localStorage. Never throws. */
import type { UiMessage } from './model';

const KEY = 'mrmoney.chat.v1';
export const HISTORY_LIMIT = 50;

/** Strip heavy, non-JSON-stable data before saving (previews carry whole engine states). */
function slim(m: UiMessage): UiMessage {
  if (!m.cards?.length) return m;
  return {
    ...m,
    cards: m.cards.map((c) => {
      if (c.type === 'preview') {
        // A preview cannot be applied after a reload (the plan may have moved on): mark it expired.
        const { pv: _pv, ...rest } = c;
        void _pv;
        return { ...rest, pv: null, state: c.state === 'open' ? 'expired' : c.state };
      }
      return c;
    }),
  };
}

export function loadHistory(): UiMessage[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; messages?: UiMessage[] };
    if (parsed?.version !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages.slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(messages: UiMessage[]): boolean {
  try {
    const out = messages.slice(-HISTORY_LIMIT).map(slim);
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, messages: out }));
    return true;
  } catch {
    return false;
  }
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
}
