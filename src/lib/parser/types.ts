import type { Intent } from '@/lib/engine/types';

export interface ParseContext {
  /** ISO calendar day the user is "in" (Europe/London). */
  today: string;
  demoMode: boolean;
  categories: { id: string; name: string }[];
}

export type ParseSource = 'gemini' | 'demo';
export type ClarifyField = 'amount' | 'currency' | 'date' | 'intent' | 'category' | 'target';

export type ParseResult =
  | { kind: 'intent'; intent: Intent; confidence: number; source: ParseSource }
  | { kind: 'clarify'; question: string; missing: ClarifyField[]; source?: ParseSource }
  | { kind: 'error'; message: string };

export interface IntentParser {
  parse(text: string, ctx: ParseContext): Promise<ParseResult>;
}
