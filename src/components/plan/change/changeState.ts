'use client';
/**
 * Tiny external store shared by Composer (submits) and ChangePanel (renders).
 * All numbers come from the engine/store; this module only orchestrates parse -> preview/apply -> undo.
 */
import { useSyncExternalStore } from 'react';
import { explain } from '@/lib/engine';
import type { Affordability, ChangeSet, Explanation, Intent } from '@/lib/engine';
import { getAppStore } from '@/lib/store';
import type { PreviewResult } from '@/lib/store';
import type { ClarifyField, ParseResult, ParseSource } from '@/lib/parser/types';

/** Store's PreviewResult type drops `affordability` (engine returns it at runtime); re-add it here. */
export type PreviewData = PreviewResult & { affordability?: Affordability };

export type ChangeView =
  | { status: 'idle' }
  | { status: 'pending'; text: string }
  | { status: 'clarify'; question: string; missing: ClarifyField[]; originalText: string; source?: ParseSource }
  | { status: 'error'; message: string }
  | { status: 'preview'; intent: Intent; source: ParseSource; pv: PreviewData; key: string; chosenOptionId: string | null; userText: string; applying?: boolean }
  | { status: 'applied'; intent: Intent; source: ParseSource; diff: ChangeSet; explanation: Explanation; changeId: number; noop: boolean; userText: string }
  | { status: 'undone' };

/**
 * TAB-SWITCHING SIGNAL (for the plan layout). Subscribe with `useChangeSignal()` (or `subscribeChange` +
 * `getChangeSignal`). `revision` increments on EVERY view transition (pending, clarify, error, preview,
 * applied, undone, dismissed), so an effect keyed on `revision` fires once per transition.
 * `lastResultKind` is the status that transition produced: 'idle' | 'pending' | 'clarify' | 'error' |
 * 'preview' | 'applied' | 'undone'. To make sure the user sees the answer, switch to the Change tab
 * (and open the mobile sheet) whenever lastResultKind is one of 'pending' | 'clarify' | 'error' | 'preview'
 * | 'applied' | 'undone'. The snapshot object is stable between transitions (safe for useSyncExternalStore).
 */
export interface ChangeSignal {
  revision: number;
  lastResultKind: ChangeView['status'];
}
let signal: ChangeSignal = { revision: 0, lastResultKind: 'idle' };
export const getChangeSignal = (): ChangeSignal => signal;
const IDLE_SIGNAL: ChangeSignal = { revision: 0, lastResultKind: 'idle' };

let view: ChangeView = { status: 'idle' };
let seq = 0;
let keyCounter = 0;
const listeners = new Set<() => void>();

function set(v: ChangeView) {
  view = v;
  signal = { revision: signal.revision + 1, lastResultKind: v.status };
  listeners.forEach((l) => l());
}
export const getChangeView = (): ChangeView => view;
export function subscribeChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const IDLE: ChangeView = { status: 'idle' };
export function useChangeSignal(): ChangeSignal {
  return useSyncExternalStore(subscribeChange, getChangeSignal, () => IDLE_SIGNAL);
}
export function useChangeView(): ChangeView {
  return useSyncExternalStore(subscribeChange, getChangeView, () => IDLE);
}

/** A fresh idempotency key per submission (never reused, even across reloads). */
const newKey = () => {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `ui-${Date.now().toString(36)}-${++keyCounter}-${rnd}`;
};
const FRIENDLY = 'Something went wrong reading that, and nothing was changed. Please try again.';

export function dismissChange() {
  seq++;
  set({ status: 'idle' });
}

/** Returns true when the input should be cleared (a preview or applied change is showing). */
export async function submitText(rawText: string): Promise<boolean> {
  const text = rawText.trim();
  if (!text || view.status === 'pending') return false;
  const store = getAppStore();
  const snap = store.getSnapshot();
  if (!snap.state) {
    set({ status: 'error', message: 'Set up your plan first (or try the demo student), then tell me what changed.' });
    return false;
  }
  const mine = ++seq;
  set({ status: 'pending', text });
  let result: ParseResult;
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        today: snap.today,
        demoMode: snap.demoActive,
        categories: snap.state.profile.categories.map((c) => ({ id: c.id, name: c.name })),
      }),
    });
    result = (await res.json()) as ParseResult;
    if (!result || typeof result !== 'object' || !('kind' in result)) throw new Error('bad response');
  } catch {
    if (mine === seq) set({ status: 'error', message: FRIENDLY });
    return false;
  }
  if (mine !== seq) return false;

  if (result.kind === 'error') {
    set({ status: 'error', message: result.message || FRIENDLY });
    return false;
  }
  if (result.kind === 'clarify') {
    set({ status: 'clarify', question: result.question, missing: result.missing, originalText: text, source: result.source });
    return false;
  }

  const source: ParseSource = result.source;
  const key = newKey();
  const intent = { ...result.intent, idempotencyKey: key } as Intent;

  if (intent.kind === 'hypothetical') {
    const pv = store.preview(intent) as PreviewData | null;
    if (!pv) {
      set({ status: 'error', message: FRIENDLY });
      return false;
    }
    const aff = pv.affordability;
    const shortfall = !pv.ok && pv.error?.code === 'shortfall' && aff && !aff.fits;
    if (pv.ok || shortfall) {
      set({ status: 'preview', intent, source, pv, key, chosenOptionId: null, userText: text });
      return true;
    }
    if (!pv.ok && pv.needsClarification) {
      set({ status: 'clarify', question: pv.needsClarification.question, missing: [], originalText: text, source });
      return false;
    }
    set({ status: 'error', message: (!pv.ok && pv.error?.message) || FRIENDLY });
    return false;
  }

  return commit(intent, source, key, text);
}

function commit(intent: Intent, source: ParseSource, key: string, userText: string): boolean {
  const store = getAppStore();
  const out = store.apply(intent, key);
  if (!out.ok) {
    if (out.needsClarification) {
      set({ status: 'clarify', question: out.needsClarification.question, missing: [], originalText: '', source });
    } else {
      set({ status: 'error', message: out.error?.message || FRIENDLY });
    }
    return false;
  }
  const diff = out.diff ?? store.getSnapshot().lastDiff;
  if (!diff) {
    set({ status: 'applied', intent, source, diff: null as unknown as ChangeSet, explanation: { facts: [], sentence: 'This change was already applied, so nothing changed.' }, changeId: out.changeId, noop: true, userText });
    return true;
  }
  set({ status: 'applied', intent, source, diff, explanation: explain(diff), changeId: out.changeId, noop: out.noop, userText });
  return true;
}

/** Quick-reply to a clarification: resubmits the original sentence combined with the reply. */
export function clarifyReply(reply: string): Promise<boolean> {
  const v = view;
  if (v.status !== 'clarify') return Promise.resolve(false);
  const base = v.originalText;
  let text: string;
  if (v.missing.includes('intent')) text = `${reply} ${base}`;
  else text = base ? `${base} ${reply}` : reply;
  return submitText(text);
}

export function chooseOption(id: string) {
  if (view.status === 'preview') set({ ...view, chosenOptionId: id });
}

/** Shows "Applying…" briefly (so the click is acknowledged), then commits. */
export async function applyPreview(): Promise<boolean> {
  const v = view;
  if (v.status !== 'preview' || v.applying) return false;
  const aff = v.pv.affordability;
  const needsOption = !!aff && !aff.fits;
  if (needsOption && !v.chosenOptionId) return false;
  const intent: Intent =
    v.intent.kind === 'hypothetical' && needsOption ? { ...v.intent, tradeoffOptionId: v.chosenOptionId ?? undefined } : v.intent;
  const mine = ++seq;
  set({ ...v, applying: true });
  await new Promise((r) => setTimeout(r, 220));
  if (mine !== seq) return false;
  return commit(intent, v.source, v.key, v.userText);
}

export function undoChange(): void {
  const store = getAppStore();
  if (store.undo()) set({ status: 'undone' });
  else set({ status: 'error', message: 'Nothing to undo.' });
}

export type { PreviewResult };
