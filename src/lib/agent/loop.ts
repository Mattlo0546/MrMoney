/** The chat-contract loop: gemini-4-argon with function calling, server tools run inline, client tools round-trip via modelState. */
import { z } from 'zod';
import { CHAT_MODEL, CHAT_TIMEOUT_MS, GeminiError, generateContent, visibleText, type GeminiContent, type GeminiPart } from './gemini';
import { systemPrompt } from './prompt';
import { researchForModel, runResearch, type ResearchDeps } from './research';
import { decodeState, encodeState, type ModelState, type PendingCall } from './state';
import { functionDeclarations } from './tools';
import {
  AskUserArgsSchema, CLIENT_TOOL_SCHEMAS, CONFIRM_TOOLS, MAX_LOOP_STEPS, ResearchArgsSchema,
  type Card, type ChatMessage, type ChatRequest, type ChatResponse, type ClientToolCall, type ClientToolName, type ResearchResult,
} from './types';

export type StatusFn = (s: { phase: 'thinking' | 'researching'; label: string; step: number }) => void;

export interface LoopDeps {
  apiKey?: string;
  secret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  model?: string;
  timeoutMs?: number;
  research?: (args: z.infer<typeof ResearchArgsSchema>, deps: ResearchDeps) => Promise<ResearchResult>;
  onStatus?: StatusFn;
  /** Timeout for the model step that follows a research call (default POST_RESEARCH_TIMEOUT_MS). */
  postResearchTimeoutMs?: number;
  /** Delay before the single retry on 429/5xx (default 600ms). */
  retryDelayMs?: number;
  /** Optional thinkingConfig for the chat model (default: model default). */
  thinkingConfig?: Record<string, unknown>;
}

/** The summary step after research gets less time so the whole research turn stays near the ~30s budget. */
export const POST_RESEARCH_TIMEOUT_MS = 12_000;

let cardSeq = 0;
const cardId = (p: string) => `${p}-${Date.now().toString(36)}-${(cardSeq++).toString(36)}`;

export function errorReply(message: string, retryable = true, earlier: Card[] = []): ChatResponse {
  return { kind: 'reply', text: message, cards: [...earlier, { id: cardId('err'), type: 'error', message, retryable }], phase: 'error' };
}

/** Rebuilds Gemini contents from the UI history (text only). Research and change cards are summarised so the model can refer back. */
export function contentsFromMessages(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    let text = m.text.trim();
    if (m.role === 'assistant' && m.cards?.length) {
      const notes: string[] = [];
      for (const c of m.cards) {
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'research_results' && Array.isArray(c.items)) {
          notes.push(`[research ${c.sample ? 'SAMPLE' : 'live'} ${c.retrievedAt}: ${c.items.slice(0, 6).map((i) => `ref ${i.ref}: ${i.provider} ${i.product} — ${i.headline}`).join('; ')}]`);
        } else if (c.type === 'change_applied') notes.push(`[applied change ${c.changeId}: ${c.explanation}]`);
        else if (c.type === 'preview') notes.push(`[preview shown (${c.tool}): ${c.explanation}]`);
        else if (c.type === 'plan_created') notes.push('[plan created]');
      }
      if (notes.length) text = `${text}\n${notes.join('\n')}`.trim();
    }
    if (!text) continue;
    const role = m.role === 'user' ? 'user' : 'model';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function issuesText(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ');
}

const fnResponse = (name: string, id: string | undefined, response: Record<string, unknown>): GeminiPart => ({
  functionResponse: { name, ...(id ? { id } : {}), response },
});

function friendlyModelError(e: unknown): string {
  if (e instanceof GeminiError && e.timeout) return 'Sorry, that took too long. Please try again.';
  if (e instanceof GeminiError && e.status === 429) return 'I\'m a bit busy right now. Please try again in a moment.';
  return 'Sorry, I couldn\'t reach the assistant just now. Your plan is safe; please try again.';
}

export async function runChat(req: ChatRequest, deps: LoopDeps): Promise<ChatResponse> {
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return errorReply('The chat assistant isn\'t configured (no API key). You can still use the plan and the demo.', false);
  const now = deps.now ?? Date.now;
  const today = req.context.today;
  const cards: Card[] = [];

  let contents: GeminiContent[];
  let step: number;

  if (req.toolResults?.length) {
    const st = decodeState(req.modelState, deps.secret, now());
    if (!st) return errorReply('I lost track of that step. Please send your message again.');
    contents = st.contents;
    step = st.step;
    const byId = new Map(req.toolResults.map((r) => [r.id, r]));
    const parts = [...st.pending].sort((a, b) => a.index - b.index).map((p) => {
      if (p.response) return p.response;
      const r = byId.get(p.id);
      if (!r || r.name !== p.client) return fnResponse(p.name, p.id, { ok: false, error: 'The app did not run this tool.' });
      return fnResponse(p.name, p.id, r.ok ? { ok: true, result: r.result ?? null } : { ok: false, error: r.error ?? 'Failed', result: r.result ?? null });
    });
    contents.push({ role: 'user', parts });
  } else {
    contents = contentsFromMessages(req.messages);
    if (!contents.length || contents[contents.length - 1].role !== 'user') return errorReply('Send me a message to get started.', false);
    step = 0;
  }

  const continuedAfterClientSuccess = !!req.toolResults?.length && req.toolResults.every((r) => r.ok);
  const firstStep = step + 1;
  const tools = [{ functionDeclarations: functionDeclarations() }];
  const sys = systemPrompt(req.context);

  while (true) {
    if (step >= MAX_LOOP_STEPS) {
      return errorReply('Sorry, that needed too many steps. Could you try it in smaller pieces?', false, cards);
    }
    step++;
    deps.onStatus?.({ phase: 'thinking', label: 'Thinking…', step });
    let parts: GeminiPart[];
    try {
      const baseTimeout = deps.timeoutMs ?? CHAT_TIMEOUT_MS;
      const timeoutMs = cards.some((c) => c.type === 'research_results') ? Math.min(baseTimeout, deps.postResearchTimeoutMs ?? POST_RESEARCH_TIMEOUT_MS) : baseTimeout;
      const call = () => generateContent({
        apiKey, model: deps.model ?? CHAT_MODEL, fetchImpl: deps.fetchImpl, timeoutMs,
        body: {
          systemInstruction: { parts: [{ text: sys }] },
          contents,
          tools,
          generationConfig: { temperature: 1, ...(deps.thinkingConfig ? { thinkingConfig: deps.thinkingConfig } : {}) },
        },
      });
      // One retry for transient HTTP errors only (not timeouts: the latency budget is spent).
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
        if (res.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY') return errorReply('Sorry, I can\'t help with that one.', false);
        throw new GeminiError('Empty response');
      }
    } catch (e) {
      // Research already produced cited cards: show them rather than an error (no figures in the text).
      const research = cards.find((c) => c.type === 'research_results');
      if (research && research.type === 'research_results') {
        const text = research.sample
          ? 'Live search isn\'t available right now, so here are some sample offers. Check with the provider before acting.'
          : 'Here\'s what I found. These are live search results, so check with the provider before acting.';
        return { kind: 'reply', text, cards, phase: 'done' };
      }
      // The client already applied its tools successfully: don't turn a slow summary into an error.
      if (continuedAfterClientSuccess && step === firstStep) {
        const previewsOnly = req.toolResults!.every((r) => CONFIRM_TOOLS.includes(r.name));
        const text = previewsOnly
          ? 'Here\'s the preview. Tap Apply to make the change, or Discard to leave your plan as it is.'
          : 'Done. Tell me if you want to change anything.';
        return { kind: 'reply', text, cards, phase: 'done' };
      }
      return errorReply(friendlyModelError(e), true, cards);
    }

    // Replay the model's parts EXACTLY (thoughtSignatures included).
    contents.push({ role: 'model', parts });
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    const draft = visibleText(parts);
    if (!calls.length) return { kind: 'reply', text: draft || 'Done.', cards, phase: 'done' };

    const pending: PendingCall[] = [];
    const clientArgs = new Map<string, unknown>();
    let clarify: { question: string; chips: string[] } | null = null;
    for (const [index, call] of calls.entries()) {
      const id = call.id || `c${step}-${index}`;
      const name = call.name;
      const args = call.args ?? {};
      if (name in CLIENT_TOOL_SCHEMAS) {
        const tool = name as ClientToolName;
        const parsed = CLIENT_TOOL_SCHEMAS[tool].safeParse(args);
        if (!parsed.success) {
          pending.push({ index, id, name, response: fnResponse(name, call.id, { ok: false, error: `Invalid arguments: ${issuesText(parsed.error)}. Ask the user for the missing or correct detail.` }) });
        } else {
          pending.push({ index, id, name, client: tool });
          clientArgs.set(id, parsed.data);
        }
      } else if (name === 'research') {
        const parsed = ResearchArgsSchema.safeParse(args);
        if (!parsed.success) {
          pending.push({ index, id, name, response: fnResponse(name, call.id, { ok: false, error: `Invalid arguments: ${issuesText(parsed.error)}` }) });
          continue;
        }
        deps.onStatus?.({ phase: 'researching', label: 'Searching the web…', step });
        const result = await (deps.research ?? runResearch)(parsed.data, { apiKey, fetchImpl: deps.fetchImpl, today });
        cards.push({ id: cardId('research'), type: 'research_results', actions: [{ kind: 'use_rate_in_projections' }, { kind: 'apply_deal' }], ...result });
        pending.push({ index, id, name, response: fnResponse(name, call.id, { ok: true, ...researchForModel(result) }) });
      } else if (name === 'ask_user') {
        const parsed = AskUserArgsSchema.safeParse(args);
        if (parsed.success) clarify = { question: parsed.data.question, chips: parsed.data.options ?? [] };
        pending.push({ index, id, name, response: fnResponse(name, call.id, parsed.success ? { ok: true, shown: true } : { ok: false, error: issuesText(parsed.error) }) });
      } else {
        pending.push({ index, id, name, response: fnResponse(name, call.id, { ok: false, error: `Unknown tool ${name}` }) });
      }
    }

    const clientCalls = pending.filter((p) => p.client);
    if (clientCalls.length) {
      const state: ModelState = { v: 1, iat: now(), step, contents, pending };
      return {
        kind: 'tool_calls',
        calls: clientCalls.map((c) => ({ id: c.id, name: c.client!, args: clientArgs.get(c.id) }) as ClientToolCall),
        ...(draft ? { assistantDraft: draft } : {}),
        cards,
        modelState: encodeState(state, deps.secret),
        phase: 'awaiting_client',
        step,
      };
    }
    if (clarify) {
      const text = draft ? `${draft}\n\n${clarify.question}`.trim() : clarify.question;
      return { kind: 'reply', text, cards: [...cards, { id: cardId('clarify'), type: 'clarify', question: clarify.question, chips: clarify.chips }], phase: 'done' };
    }
    contents.push({ role: 'user', parts: pending.sort((a, b) => a.index - b.index).map((p) => p.response!) });
  }
}

