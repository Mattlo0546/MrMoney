/**
 * UI-side chat model. Server cards (from `@/lib/agent/types`) and client tool outcomes are both
 * normalised into these UiCards. Every £ figure shown comes from the engine (diffs, summaries)
 * or from a cited research result; the UI only formats.
 */
import type { ChangeSet, Explanation, Intent, Summary } from '@/lib/engine';
import type { PreviewData } from '@/components/plan/change/changeState';

export type CardState = 'open' | 'applied' | 'discarded' | 'expired' | 'failed';

export interface ResearchItemUi {
  ref?: string;
  provider: string;
  product?: string;
  headline: string;
  ratePercent?: number;
  conditions: string[];
  sourceUrl: string;
  sourceTitle?: string;
}

export type UiCard =
  | { type: 'plan_created'; id: string; summary: Summary; horizonEnd: string; planStart: string; bills: { name: string; pence: number }[] }
  | {
      type: 'change_applied'; id: string; intent: Intent; diff: ChangeSet | null; explanation: Explanation;
      changeId: number; noop: boolean; undone?: boolean;
    }
  | {
      type: 'preview'; id: string; tool: string; title: string; intent: Intent; pv: PreviewData | null;
      chosenOptionId: string | null; state: CardState; result?: string;
      /** apply_deal: a planned purchase is replaced (remove + re-plan at the new amount). */
      replaceFirst?: Intent;
    }
  | {
      type: 'confirm'; id: string; tool: 'use_rate_in_projections'; title: string; lines: string[];
      bucket: 'savings' | 'investments'; ratePercent: number; sourceRef?: string; state: CardState; result?: string;
    }
  | { type: 'clarify'; id: string; question: string; chips: string[]; answered?: boolean }
  | {
      type: 'research_results'; id: string; topic?: string; items: ResearchItemUi[]; retrievedAt?: string; sample?: boolean;
      label?: string; query?: string;
      /** The server card, echoed back so the model can refer to item refs. */
      raw?: unknown;
    }
  | { type: 'error'; id: string; message: string }
  | { type: 'notice'; id: string; text: string };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: UiCard[];
  /** ISO timestamp. */
  at: string;
  /** Not sent back to the model (e.g. local offline notices). */
  localOnly?: boolean;
}

let n = 0;
export const newId = (p = 'm'): string => {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${p}-${Date.now().toString(36)}-${(n++).toString(36)}-${rnd}`;
};

export type Phase = 'idle' | 'thinking' | 'searching' | 'updating' | 'offline';

export const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  thinking: 'Thinking…',
  searching: 'Searching the web…',
  updating: 'Updating your plan…',
  offline: 'Reading that (offline)…',
};
