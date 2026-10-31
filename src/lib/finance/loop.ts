/**
 * Money agent loop: gemini-4-argon with function calling. Every tool runs on the server (research, allocate,
 * compare_savings, update_profile, ask_user), so a turn is one request; no client round trip or modelState.
 */
import { z } from 'zod';
import { CHAT_MODEL, CHAT_TIMEOUT_MS, GeminiError, generateContent, visibleText, type GeminiContent, type GeminiPart } from '@/lib/agent/gemini';
import { researchForModel, runResearch, type ResearchDeps } from '@/lib/agent/research';
import { toGeminiSchema } from '@/lib/agent/tools';
import type { ResearchArgs, ResearchResult } from '@/lib/agent/types';
import { allocate, compareSavings } from './allocate';
import { moneySystemPrompt } from './prompt';
import {
  AllocateArgsSchema, AskUserArgsSchema, CompareSavingsArgsSchema, FinanceProfileSchema, FinanceResearchArgsSchema, UpdateProfileArgsSchema,
  type FinanceProfile, type FinanceResearchTopic, type MoneyCard, type MoneyMessage, type MoneyRequest, type MoneyResponse, type MoneyStatus,
} from './types';

export const MONEY_MAX_STEPS = 6;
export const MONEY_THINKING = { thinkingLevel: 'low' } as const;
export const MONEY_MAX_OUTPUT_TOKENS = 2048;
/** The step after a research call gets less time so the turn stays near the ~30s budget. */
export const MONEY_POST_RESEARCH_TIMEOUT_MS = 15_000;

export interface MoneyDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  timeoutMs?: number;
  postResearchTimeoutMs?: number;
  retryDelayMs?: number;
  research?: (args: ResearchArgs, deps: ResearchDeps) => Promise<ResearchResult>;
  onStatus?: (s: MoneyStatus) => void;
}

/** Finance topics map onto the shared research tool; topics it doesn't know go through 'other' with a precise query. */
const RESEARCH_QUERIES: Record<FinanceResearchTopic, { topic: ResearchArgs['topic']; query: string }> = {
  easy_access_savings: { topic: 'savings_rates', query: 'Best UK easy-access savings accounts today: AER, bonus and when it ends, conditions' },
  cash_isa: { topic: 'cash_isa_rates', query: 'Best UK easy-access cash ISAs today: AER, bonus and when it ends, transfers in' },
  regular_savers: { topic: 'other', query: 'Best UK regular saver accounts today: rate, fixed or variable, monthly cap, term, current account required' },
  lifetime_isa: { topic: 'other', query: 'Best UK Lifetime ISA providers today (cash and stocks): rate or fees, plus current LISA rules and withdrawal charge' },
  investment_platforms: { topic: 'other', query: 'Cheapest UK stocks and shares ISA platforms today: platform fee, dealing fee, FX fee, minimum' },
  index_funds: { topic: 'other', query: 'Cheapest UK-listed S&P 500 and FTSE All-World / MSCI World index ETFs: ticker, ongoing charge, accumulating or distributing' },
  crypto_rules: { topic: 'other', query: 'Current UK rules for crypto ETNs in ISAs and SIPPs, FCA status, and capital gains tax on crypto' },
  bank_plans: { topic: 'other', query: 'Monzo Perks, Extra and Max current monthly price and instant access savings rate by plan' },
};

export function researchArgsFor(topic: FinanceResearchTopic, extra?: string): ResearchArgs {
  const base = RESEARCH_QUERIES[topic];
  const query = extra?.trim() ? `${base.query}. Focus: ${extra.trim()}` : base.query;
  return { topic: base.topic, query: query.slice(0, 200) };
}

export function moneyFunctionDeclarations() {
  return [
    { name: 'allocate', description: 'Run the allocation engine on the saved profile: monthly split by bucket with reasons, emergency-fund gap, and checks (paid bank plan value, ISA wrapper, fees, crypto share). Optional what-if overrides.', parametersJsonSchema: toGeminiSchema(AllocateArgsSchema) },
    { name: 'compare_savings', description: '£ per year gained by moving the cash savings to another rate (includes dropping any paid bank plan). Use with a researched rate and its ref.', parametersJsonSchema: toGeminiSchema(CompareSavingsArgsSchema) },
    { name: 'research', description: 'Live, cited web search for current UK rates, fees, funds and rules. Use for EVERY rate, fee or rule.', parametersJsonSchema: toGeminiSchema(FinanceResearchArgsSchema) },
    { name: 'update_profile', description: 'Save facts the user stated about their money (only the fields they gave; integer pence, rates in %).', parametersJsonSchema: toGeminiSchema(UpdateProfileArgsSchema) },
    { name: 'ask_user', description: 'Ask ONE short question with up to 5 quick-reply options. Ends your turn.', parametersJsonSchema: toGeminiSchema(AskUserArgsSchema) },
  ];
}

let seq = 0;
const cardId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function moneyError(message: string, retryable = true, earlier: MoneyCard[] = []): MoneyResponse {
  return { text: message, cards: [...earlier, { id: cardId('err'), type: 'error', message, retryable }], phase: 'error' };
}

export function moneyContents(messages: MoneyMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    const text = [m.text.trim(), m.role === 'assistant' ? m.notes?.trim() : ''].filter(Boolean).join('\n');
    if (!text) continue;
    const role = m.role === 'user' ? 'user' : 'model';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ');
const fnResponse = (name: string, id: string | undefined, response: Record<string, unknown>): GeminiPart => ({
  functionResponse: { name, ...(id ? { id } : {}), response },
});

function friendly(e: unknown): string {
  if (e instanceof GeminiError && e.timeout) return 'Sorry, that took too long. Please try again.';
  if (e instanceof GeminiError && e.status === 429) return 'I\'m a bit busy right now. Please try again in a moment.';
  return 'Sorry, I couldn\'t reach the assistant just now. Please try again.';
}

export async function runMoney(req: MoneyRequest, deps: MoneyDeps): Promise<MoneyResponse> {
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return moneyError('The Money agent isn\'t configured (no API key). The allocation on this page still works.', false);
  const contents = moneyContents(req.messages);
  if (!contents.length || contents[contents.length - 1].role !== 'user') return moneyError('Send me a message to get started.', false);

  let profile: FinanceProfile = req.profile;
  let profileChanged = false;
  const cards: MoneyCard[] = [];
  const tools = [{ functionDeclarations: moneyFunctionDeclarations() }];
  const done = (text: string): MoneyResponse => ({ text, cards, ...(profileChanged ? { profile } : {}), phase: 'done' });

  for (let step = 1; ; step++) {
    if (step > MONEY_MAX_STEPS) return { ...moneyError('Sorry, that needed too many steps. Could you ask it in smaller pieces?', false, cards), ...(profileChanged ? { profile } : {}) };
    deps.onStatus?.({ phase: 'thinking', label: 'Thinking…', step });
    let parts: GeminiPart[];
    try {
      const base = deps.timeoutMs ?? CHAT_TIMEOUT_MS;
      const timeoutMs = cards.some((c) => c.type === 'research_results') ? Math.min(base, deps.postResearchTimeoutMs ?? MONEY_POST_RESEARCH_TIMEOUT_MS) : base;
      const call = () => generateContent({
        apiKey, model: deps.model ?? CHAT_MODEL, fetchImpl: deps.fetchImpl, timeoutMs,
        body: {
          // Rebuilt each step so update_profile is reflected in the next step's context.
          systemInstruction: { parts: [{ text: moneySystemPrompt(profile, req.today) }] },
          contents,
          tools,
          generationConfig: { temperature: 1, maxOutputTokens: MONEY_MAX_OUTPUT_TOKENS, thinkingConfig: MONEY_THINKING },
        },
      });
      const res = await call().catch(async (e: unknown) => {
        if (e instanceof GeminiError && e.status !== undefined && (e.status === 429 || e.status >= 500)) {
          await new Promise((r) => setTimeout(r, deps.retryDelayMs ?? 600));
          return call();
        }
        throw e;
      });
      const cand = res.candidates?.[0];
      parts = (cand?.content?.parts ?? []) as GeminiPart[];
      if (!parts.length) {
        if (res.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY') return moneyError('Sorry, I can\'t help with that one.', false);
        throw new GeminiError('Empty response');
      }
    } catch (e) {
      // Tools already produced cards: show them rather than an error.
      if (cards.some((c) => c.type === 'research_results' || c.type === 'allocation' || c.type === 'comparison')) {
        return done('Here\'s what I found. Rates come from live search, so check with the provider before acting.');
      }
      return { ...moneyError(friendly(e), true, cards), ...(profileChanged ? { profile } : {}) };
    }

    contents.push({ role: 'model', parts });
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    const draft = visibleText(parts);
    if (!calls.length) return done(draft || 'Done.');

    const responses: GeminiPart[] = [];
    let clarify: { question: string; chips: string[] } | null = null;
    for (const call of calls) {
      const args = call.args ?? {};
      const reply = (r: Record<string, unknown>) => responses.push(fnResponse(call.name, call.id, r));
      switch (call.name) {
        case 'allocate': {
          const a = AllocateArgsSchema.safeParse(args);
          if (!a.success) { reply({ ok: false, error: issues(a.error) }); break; }
          deps.onStatus?.({ phase: 'calculating', label: 'Working out your split…', step });
          const allocation = allocate(profile, req.today, a.data);
          cards.push({ id: cardId('alloc'), type: 'allocation', allocation });
          reply({ ok: true, allocation });
          break;
        }
        case 'compare_savings': {
          const a = CompareSavingsArgsSchema.safeParse(args);
          if (!a.success) { reply({ ok: false, error: issues(a.error) }); break; }
          const comparison = compareSavings(profile, a.data);
          cards.push({ id: cardId('cmp'), type: 'comparison', comparison });
          reply({ ok: true, comparison });
          break;
        }
        case 'research': {
          const a = FinanceResearchArgsSchema.safeParse(args);
          if (!a.success) { reply({ ok: false, error: issues(a.error) }); break; }
          deps.onStatus?.({ phase: 'researching', label: 'Searching the web…', step });
          const result = await (deps.research ?? runResearch)(researchArgsFor(a.data.topic, a.data.query), { apiKey, fetchImpl: deps.fetchImpl, today: req.today });
          cards.push({ id: cardId('research'), type: 'research_results', ...result });
          reply({ ok: true, ...researchForModel(result) });
          break;
        }
        case 'update_profile': {
          const a = UpdateProfileArgsSchema.safeParse(args);
          const next = a.success ? FinanceProfileSchema.safeParse({ ...profile, ...a.data }) : null;
          if (!a.success || !next?.success) { reply({ ok: false, error: a.success ? issues(next!.error!) : issues(a.error) }); break; }
          const fields = Object.keys(a.data);
          profile = next.data;
          profileChanged = true;
          if (fields.length) cards.push({ id: cardId('prof'), type: 'profile_updated', fields });
          reply({ ok: true, saved: fields });
          break;
        }
        case 'ask_user': {
          const a = AskUserArgsSchema.safeParse(args);
          if (a.success) clarify = { question: a.data.question, chips: a.data.options ?? [] };
          reply(a.success ? { ok: true, shown: true } : { ok: false, error: issues(a.error) });
          break;
        }
        default:
          reply({ ok: false, error: `Unknown tool ${call.name}` });
      }
    }
    if (clarify) {
      const text = draft ? `${draft}\n\n${clarify.question}` : clarify.question;
      cards.push({ id: cardId('clarify'), type: 'clarify', question: clarify.question, chips: clarify.chips });
      return done(text.trim());
    }
    contents.push({ role: 'user', parts: responses });
  }
}
