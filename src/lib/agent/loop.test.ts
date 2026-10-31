import { describe, expect, it, vi } from 'vitest';
import type { GeminiContent } from './gemini';
import { contentsFromMessages, runChat, type LoopDeps } from './loop';
import { decodeState, encodeState } from './state';
import { geminiResponse, hangingFetch, scriptedFetch } from './testkit';
import type { ChatRequest, ChatResponse, ResearchResult } from './types';

const SECRET = 'test-secret';
const ctx = { today: '2026-10-31', demoMode: false, hasPlan: false };
const req = (text: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({ messages: [{ role: 'user', text }], context: ctx, ...extra });
const deps = (fetchImpl: typeof fetch, more: Partial<LoopDeps> = {}): LoopDeps => ({ apiKey: 'k', secret: SECRET, fetchImpl, ...more });

const SETUP_ARGS = {
  funds: 390000, fundsType: 'lump', horizonEnd: '2027-01-31',
  commitments: [{ name: 'Rent', amountPence: 62000, recurrence: 'monthly', dayOfMonth: 1 }],
  incomes: [], minimumReserve: 20000, savingsGoal: 0, foodWeeklyPence: 3500, transportWeeklyPence: 1200, priorities: [],
};
const contentsOf = (b: Record<string, unknown>) => b.contents as GeminiContent[];
const asCalls = (r: ChatResponse) => {
  if (r.kind !== 'tool_calls') throw new Error(`expected tool_calls, got ${JSON.stringify(r)}`);
  return r;
};

describe('runChat: client tool round trip', () => {
  it('returns validated client calls, then replays the model parts (thoughtSignature) with functionResponses', async () => {
    const modelParts = [
      { text: 'Setting that up.' },
      { functionCall: { name: 'setup_plan', args: SETUP_ARGS, id: 'call_1' }, thoughtSignature: 'SIG-abc==' },
    ];
    const f = scriptedFetch([() => geminiResponse(modelParts), () => geminiResponse([{ text: 'Your plan is ready.' }])]);
    const r1 = asCalls(await runChat(req('I have £3,900 until end of Jan, rent £620 on the 1st'), deps(f.impl, { directReplies: false })));
    expect(r1.calls).toEqual([{ id: 'call_1', name: 'setup_plan', args: SETUP_ARGS }]);
    expect(r1.assistantDraft).toBe('Setting that up.');
    expect(r1.phase).toBe('awaiting_client');
    expect(r1.step).toBe(1);
    // key only in the header, function declarations sent
    expect(f.calls[0].headers['x-goog-api-key']).toBe('k');
    expect(f.calls[0].url).toContain('gemini-4-argon');
    expect(f.calls[0].url).not.toContain('key=');

    const r2 = await runChat(
      req('I have £3,900 until end of Jan, rent £620 on the 1st', {
        toolResults: [{ id: 'call_1', name: 'setup_plan', ok: true, result: { todayAllowancePence: 1978 } }],
        modelState: r1.modelState,
      }),
      deps(f.impl, { directReplies: false }),
    );
    expect(r2).toMatchObject({ kind: 'reply', text: 'Your plan is ready.', phase: 'done' });
    const sent = contentsOf(f.calls[1].body);
    expect(sent[sent.length - 2]).toEqual({ role: 'model', parts: modelParts });
    expect(sent[sent.length - 1]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'setup_plan', id: 'call_1', response: { ok: true, result: { todayAllowancePence: 1978 } } } }],
    });
  });

  it('passes client errors back to the model', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ functionCall: { name: 'record_expense', args: { amountPence: 1250, date: '2026-10-31', category: 'groceries' }, id: 'c1' }, thoughtSignature: 's' }]),
      () => geminiResponse([{ text: 'Which category was that?' }]),
    ]);
    const r1 = asCalls(await runChat(req('spent 12.50'), deps(f.impl)));
    await runChat(req('spent 12.50', { toolResults: [{ id: 'c1', name: 'record_expense', ok: false, error: 'Unknown category' }], modelState: r1.modelState }), deps(f.impl));
    const last = contentsOf(f.calls[1].body).at(-1)!;
    expect(last.parts[0].functionResponse?.response).toMatchObject({ ok: false, error: 'Unknown category' });
  });

  it('rejects a tampered or missing modelState with a retryable error card', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'x' }])]);
    const good = encodeState({ v: 1, iat: Date.now(), step: 1, contents: [], pending: [] }, SECRET);
    const tampered = `${good.slice(0, -3)}abc`;
    for (const modelState of [undefined, tampered, encodeState({ v: 1, iat: Date.now(), step: 1, contents: [], pending: [] }, 'other-secret')]) {
      const r = await runChat(req('hi', { toolResults: [{ id: 'c1', name: 'undo_last', ok: true }], modelState }), deps(f.impl));
      expect(r.kind).toBe('reply');
      expect(r.cards[0]).toMatchObject({ type: 'error', retryable: true });
    }
    expect(f.calls).toHaveLength(0);
  });

  it('modelState expires after 30 minutes', () => {
    const s = encodeState({ v: 1, iat: 0, step: 1, contents: [], pending: [] }, SECRET);
    expect(decodeState(s, SECRET, 29 * 60_000)).not.toBeNull();
    expect(decodeState(s, SECRET, 31 * 60_000)).toBeNull();
  });
});

describe('runChat: argument validation', () => {
  it('feeds invalid client-tool args back to the model as an error result (no client round trip)', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ functionCall: { name: 'record_expense', args: { amountPence: 12.5, date: '31/10/2026', category: 'food' }, id: 'c1' }, thoughtSignature: 'sig1' }]),
      () => geminiResponse([{ text: 'How much was it, in pounds?' }]),
    ]);
    const r = await runChat(req('spent some money'), deps(f.impl));
    expect(r).toMatchObject({ kind: 'reply', text: 'How much was it, in pounds?' });
    expect(f.calls).toHaveLength(2);
    const sent = contentsOf(f.calls[1].body);
    expect(sent.at(-2)!.parts[0].thoughtSignature).toBe('sig1');
    const resp = sent.at(-1)!.parts[0].functionResponse!;
    expect(resp).toMatchObject({ name: 'record_expense', id: 'c1' });
    expect(resp.response.ok).toBe(false);
    expect(String(resp.response.error)).toMatch(/amountPence/);
    expect(String(resp.response.error)).toMatch(/date/);
    expect(String(resp.response.error)).toMatch(/Ask the user/);
  });

  it('enforces cross-field rules (change_commitment needs exactly one of delta/new amount)', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ functionCall: { name: 'change_commitment', args: { name: 'Rent', effectiveFrom: '2026-12-01' } } }]),
      () => geminiResponse([{ text: 'By how much?' }]),
    ]);
    await runChat(req('rent is changing'), deps(f.impl));
    const resp = contentsOf(f.calls[1].body).at(-1)!.parts[0].functionResponse!;
    expect(String(resp.response.error)).toMatch(/exactly one/);
  });

  it('answers unknown tools with an error', async () => {
    const f = scriptedFetch([() => geminiResponse([{ functionCall: { name: 'buy_stock', args: {} } }]), () => geminiResponse([{ text: 'I can\'t do that.' }])]);
    const r = await runChat(req('buy me tesla'), deps(f.impl));
    expect(r.kind).toBe('reply');
    expect(contentsOf(f.calls[1].body).at(-1)!.parts[0].functionResponse!.response.error).toMatch(/Unknown tool/);
  });
});

describe('runChat: server tools', () => {
  const research: ResearchResult = {
    topic: 'savings_rates', query: 'best easy access', retrievedAt: '2026-10-31T10:00:00.000Z', sample: false, label: 'Live search result. Check with the provider before acting.',
    items: [{ ref: 'r-x-0', provider: 'Bank', product: 'Saver', headline: '4.5% AER', ratePercent: 4.5, conditions: [], sourceUrl: 'https://example.com', sourceTitle: 'example.com' }],
  };

  it('runs research inline, emits status, returns a research card and feeds compact items to the model', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ functionCall: { name: 'research', args: { topic: 'savings_rates', query: 'best easy access' }, id: 'r1' }, thoughtSignature: 'sx' }]),
      () => geminiResponse([{ text: 'Bank Saver pays 4.5% AER (live result; check with the provider).' }]),
    ]);
    const statuses: string[] = [];
    const researchFn = vi.fn(async () => research);
    const r = await runChat(req('best savings rate'), deps(f.impl, { research: researchFn, directReplies: false, onStatus: (s) => statuses.push(`${s.phase}:${s.step}`) }));
    expect(researchFn).toHaveBeenCalledWith({ topic: 'savings_rates', query: 'best easy access' }, expect.objectContaining({ today: '2026-10-31' }));
    expect(statuses).toEqual(['thinking:1', 'researching:1', 'thinking:2']);
    expect(r.kind).toBe('reply');
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]).toMatchObject({ type: 'research_results', sample: false, items: research.items });
    const fr = contentsOf(f.calls[1].body).at(-1)!.parts[0].functionResponse!;
    expect(fr.response).toMatchObject({ ok: true, live: true, items: [{ ref: 'r-x-0', provider: 'Bank', ratePercent: 4.5 }] });
  });

  it('mixed step: server research runs now, client call goes to the client, both responses replayed in call order', async () => {
    const f = scriptedFetch([
      () => geminiResponse([
        { functionCall: { name: 'research', args: { topic: 'savings_rates', query: 'q' }, id: 'a' }, thoughtSignature: 's1' },
        { functionCall: { name: 'undo_last', args: {}, id: 'b' } },
      ]),
      () => geminiResponse([{ text: 'Done.' }]),
    ]);
    const d = deps(f.impl, { research: async () => research });
    const r1 = asCalls(await runChat(req('x'), d));
    expect(r1.calls).toEqual([{ id: 'b', name: 'undo_last', args: {} }]);
    expect(r1.cards[0].type).toBe('research_results');
    await runChat(req('x', { toolResults: [{ id: 'b', name: 'undo_last', ok: true, result: 'ok' }], modelState: r1.modelState }), d);
    const parts = contentsOf(f.calls[1].body).at(-1)!.parts;
    expect(parts.map((p) => p.functionResponse!.id)).toEqual(['a', 'b']);
  });

  it('ask_user ends the turn with a clarify card', async () => {
    const f = scriptedFetch([() => geminiResponse([{ functionCall: { name: 'ask_user', args: { question: 'Is that a lump sum or monthly?', options: ['Lump sum', 'Monthly'] } } }])]);
    const r = await runChat(req('I have 3900'), deps(f.impl));
    expect(r).toMatchObject({ kind: 'reply', text: 'Is that a lump sum or monthly?', phase: 'done' });
    expect(r.cards[0]).toMatchObject({ type: 'clarify', chips: ['Lump sum', 'Monthly'] });
    expect(f.calls).toHaveLength(1);
  });

  it('after research, a model failure still shows the research card (no error)', async () => {
    const f = scriptedFetch([
      () => geminiResponse([{ functionCall: { name: 'research', args: { topic: 'savings_rates', query: 'q' } } }]),
      () => new Response('boom', { status: 500 }),
    ]);
    const r = await runChat(req('x'), deps(f.impl, { research: async () => research, retryDelayMs: 0 }));
    expect(r.phase).toBe('done');
    expect(r.cards.map((c) => c.type)).toEqual(['research_results']);
  });
});

describe('runChat: limits and errors', () => {
  it('caps the loop at 6 model calls', async () => {
    const f = scriptedFetch([() => geminiResponse([{ functionCall: { name: 'record_expense', args: { amountPence: -1 } } }])]);
    const r = await runChat(req('loop forever'), deps(f.impl));
    expect(f.calls).toHaveLength(6);
    expect(r).toMatchObject({ kind: 'reply', phase: 'error' });
    expect(r.cards.at(-1)).toMatchObject({ type: 'error', retryable: false });
  });

  it('counts steps across client round trips', async () => {
    const f = scriptedFetch([() => geminiResponse([{ functionCall: { name: 'undo_last', args: {}, id: 'u' } }])]);
    const state = encodeState({ v: 1, iat: Date.now(), step: 6, contents: [{ role: 'user', parts: [{ text: 'x' }] }], pending: [{ index: 0, id: 'u', name: 'undo_last', client: 'undo_last' }] }, SECRET);
    const r = await runChat(req('x', { toolResults: [{ id: 'u', name: 'undo_last', ok: true }], modelState: state }), deps(f.impl, { directReplies: false }));
    expect(f.calls).toHaveLength(0);
    expect(r.phase).toBe('error');
  });

  it('times out a model call and returns a friendly error card', async () => {
    const r = await runChat(req('hi'), deps(hangingFetch, { timeoutMs: 20 }));
    expect(r).toMatchObject({ kind: 'reply', phase: 'error', text: expect.stringMatching(/too long/) });
    expect(r.cards[0]).toMatchObject({ type: 'error', retryable: true });
  });

  it('retries once on a transient 5xx', async () => {
    const f = scriptedFetch([() => new Response('{}', { status: 503 }), () => geminiResponse([{ text: 'Hello!' }])]);
    expect(await runChat(req('hi'), deps(f.impl, { retryDelayMs: 0 }))).toMatchObject({ kind: 'reply', text: 'Hello!', phase: 'done' });
  });

  it('a slow summary after successful client tools degrades to a neutral reply (no numbers), not an error', async () => {
    const state = encodeState({ v: 1, iat: Date.now(), step: 1, contents: [{ role: 'user', parts: [{ text: 'x' }] }], pending: [{ index: 0, id: 'a', name: 'setup_plan', client: 'setup_plan' }] }, SECRET);
    const r = await runChat(req('x', { toolResults: [{ id: 'a', name: 'setup_plan', ok: true }], modelState: state }), deps(hangingFetch, { timeoutMs: 20, directReplies: false }));
    expect(r).toMatchObject({ kind: 'reply', phase: 'done', text: expect.stringMatching(/^Done/) });
    expect(r.kind === 'reply' && r.text).not.toMatch(/£|\d/);
    const prev = encodeState({ v: 1, iat: Date.now(), step: 1, contents: [{ role: 'user', parts: [{ text: 'x' }] }], pending: [{ index: 0, id: 'a', name: 'check_purchase', client: 'check_purchase' }] }, SECRET);
    const r2 = await runChat(req('x', { toolResults: [{ id: 'a', name: 'check_purchase', ok: true }], modelState: prev }), deps(hangingFetch, { timeoutMs: 20, directReplies: false }));
    expect(r2).toMatchObject({ text: expect.stringMatching(/Apply/) });
    // a failed client tool still surfaces the error
    const r3 = await runChat(req('x', { toolResults: [{ id: 'a', name: 'setup_plan', ok: false, error: 'bad' }], modelState: state }), deps(hangingFetch, { timeoutMs: 20 }));
    expect(r3.phase).toBe('error');
  });

  it('the step after research uses the shorter post-research timeout', async () => {
    let n = 0;
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      n++;
      if (n === 1) return geminiResponse([{ functionCall: { name: 'research', args: { topic: 'savings_rates', query: 'q' } } }]);
      return hangingFetch(u, init);
    }) as typeof fetch;
    const research: ResearchResult = { topic: 'savings_rates', query: 'q', retrievedAt: 't', sample: false, label: 'l', items: [] };
    const t = Date.now();
    const r = await runChat(req('x'), deps(f, { research: async () => research, postResearchTimeoutMs: 30, timeoutMs: 5000, directReplies: false }));
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r).toMatchObject({ phase: 'done', text: expect.stringMatching(/live search results/) });
  });

  it('HTTP errors and missing key never throw', async () => {
    const f = scriptedFetch([() => new Response('{}', { status: 429 })]);
    expect((await runChat(req('hi'), deps(f.impl, { retryDelayMs: 0 }))).cards[0].type).toBe('error');
    expect(f.calls).toHaveLength(2);
    const r = await runChat(req('hi'), { secret: SECRET, apiKey: '' });
    expect(r.cards[0]).toMatchObject({ type: 'error', retryable: false });
  });

  it('injects the context into the system instruction each turn', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'ok' }])]);
    await runChat({ messages: [{ role: 'user', text: 'hi' }], context: { today: '2026-11-11', demoMode: true, hasPlan: true, summary: { todayAllowancePence: 2584 } } }, deps(f.impl));
    const sys = JSON.stringify(f.calls[0].body.systemInstruction);
    expect(sys).toContain('2026-11-11');
    expect(sys).toContain('demo date');
    expect(sys).toContain('£25.84');
    expect(sys).toContain('Has plan: yes');
  });
});

describe('runChat: direct replies (no summary model call)', () => {
  const pendingState = (name: string, contents: GeminiContent[] = [{ role: 'user', parts: [{ text: 'x' }] }]) =>
    encodeState({ v: 1, iat: Date.now(), step: 1, contents, pending: [{ index: 0, id: 'a', name, client: name as never }] }, SECRET);

  it('after a committed expense, replies with the engine explanation (first sentences) and makes no model call', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'should not be called' }])]);
    const explanation = 'Added your £35 expense (household, 10 Nov). That day\'s allowance covered £25.84; the other £9.16 comes from later days. Shopping decreased by £9.16 across 11 Nov – 31 Jan. Rent is unchanged.';
    const r = await runChat(req('I need to spend £35 on a shower filter today', {
      toolResults: [{ id: 'a', name: 'record_expense', ok: true, result: { applied: true, changeId: '3', explanation } }], modelState: pendingState('record_expense'),
    }), deps(f.impl));
    expect(f.calls).toHaveLength(0);
    expect(r).toMatchObject({ kind: 'reply', phase: 'done' });
    const text = r.kind === 'reply' ? r.text : '';
    expect(text).toBe('Added your £35 expense (household, 10 Nov). That day\'s allowance covered £25.84; the other £9.16 comes from later days. Tap Undo if that\'s not right.');
    expect(text).not.toMatch(/\.00\b/);
  });

  it('after setup, names at most two defaults, formats money like the engine and offers one optional follow-up chip', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'should not be called' }])]);
    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: 'x' }] },
      { role: 'model', parts: [{ functionCall: { name: 'setup_plan', args: SETUP_ARGS, id: 'a' } }] },
    ];
    const r = await runChat(req('x', {
      toolResults: [{ id: 'a', name: 'setup_plan', ok: true, result: { created: true, summary: { todayAllowancePence: 1978, horizonEnd: '2027-01-31' }, deficits: [] } }],
      modelState: pendingState('setup_plan', contents),
    }), deps(f.impl));
    expect(f.calls).toHaveLength(0);
    if (r.kind !== 'reply') throw new Error('expected reply');
    expect(r.text).toBe('Your plan is ready: £19.78 to spend today, lasting to 31 Jan. I assumed £35 a week for food and a £200 safety cushion; change anything by telling me.');
    expect(r.cards).toEqual([expect.objectContaining({ type: 'clarify', chips: ['Add my job income'] })]);
  });

  it('a hypothetical that does not fit points at the options; a preview says nothing changes until Apply', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'x' }])]);
    const r = await runChat(req('x', {
      toolResults: [{ id: 'a', name: 'check_purchase', ok: true, result: { fits: false, message: '£7.62 short — 14 Nov has £11.64 to spare', explanation: '' } }], modelState: pendingState('check_purchase'),
    }), deps(f.impl));
    expect(r.kind === 'reply' && r.text).toBe('£7.62 short — 14 Nov has £11.64 to spare. Pick an option on the card, or Discard.');
    const r2 = await runChat(req('x', {
      toolResults: [{ id: 'a', name: 'check_purchase', ok: true, result: { fits: true, message: 'Fits — £8.36 comes from shopping over 12–18 Nov', explanation: 'Fits — £8.36 comes from shopping over 12–18 Nov. Set aside £20.' } }], modelState: pendingState('check_purchase'),
    }), deps(f.impl));
    expect(r2.kind === 'reply' && r2.text).toBe('Fits — £8.36 comes from shopping over 12–18 Nov. Nothing changes until you tap Apply.');
    expect(f.calls).toHaveLength(0);
  });

  it('use_rate_in_projections asks how much they have saved, suggesting the plan\'s planned savings', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'x' }])]);
    const r = await runChat({
      messages: [{ role: 'user', text: 'use the first one' }],
      context: { today: '2026-11-10', demoMode: true, hasPlan: true, summary: { plannedSavingsPence: 15000 } },
      toolResults: [{ id: 'a', name: 'use_rate_in_projections', ok: true, result: { status: 'preview shown, awaiting user' } }],
      modelState: pendingState('use_rate_in_projections'),
    }, deps(f.impl));
    expect(r.kind === 'reply' && r.text).toMatch(/How much do you have saved now\? If you don't say, I'll start from your planned savings of £150\./);
  });

  it('a failed client tool goes back to the model', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'Which category?' }])]);
    const r = await runChat(req('x', { toolResults: [{ id: 'a', name: 'record_expense', ok: false, error: 'bad' }], modelState: pendingState('record_expense') }), deps(f.impl));
    expect(f.calls).toHaveLength(1);
    expect(r).toMatchObject({ kind: 'reply', text: 'Which category?' });
  });

  it('research replies from the top cited item without a summary model call', async () => {
    const f = scriptedFetch([() => geminiResponse([{ functionCall: { name: 'research', args: { topic: 'savings_rates', query: 'q' } } }])]);
    const research: ResearchResult = {
      topic: 'savings_rates', query: 'q', retrievedAt: 't', sample: false, label: 'l',
      items: [{ ref: 'r-x-0', provider: 'Cahoot', product: 'Sunny Day Saver', headline: '5% AER variable', ratePercent: 5, conditions: [], sourceUrl: 'https://a', sourceTitle: 'savethestudent.org' }],
    };
    const r = await runChat(req('find me the best easy-access savings rate'), deps(f.impl, { research: async () => research }));
    expect(f.calls).toHaveLength(1);
    expect(r.kind === 'reply' && r.text).toBe('Top live result: Cahoot Sunny Day Saver, 5% AER variable (savethestudent.org). Tap "Use this rate in projections" to plan with one. Check with the provider before acting.');
    expect(r.cards.map((c) => c.type)).toEqual(['research_results']);
  });
});

describe('model request shape', () => {
  it('sends an output cap, and only the tools that fit hasPlan', async () => {
    const f = scriptedFetch([() => geminiResponse([{ text: 'ok' }])]);
    await runChat(req('hi'), deps(f.impl));
    await runChat({ messages: [{ role: 'user', text: 'hi' }], context: { today: '2026-11-10', demoMode: false, hasPlan: true } }, deps(f.impl));
    const names = (i: number) => ((f.calls[i].body.tools as { functionDeclarations: { name: string }[] }[])[0].functionDeclarations).map((d) => d.name);
    expect(names(0)).toEqual(['setup_plan', 'start_demo', 'research', 'ask_user']);
    expect(names(1)).not.toContain('setup_plan');
    expect(names(1)).toContain('record_expense');
    expect(f.calls[0].body.generationConfig).toMatchObject({ maxOutputTokens: 2048 });
  });

  it('hedges a slow model call with an identical request; the first answer wins and the slow one is cancelled', async () => {
    let n = 0;
    let first: AbortSignal | undefined;
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      n++;
      if (n === 1) {
        first = init?.signal ?? undefined;
        return hangingFetch(u, init);
      }
      return geminiResponse([{ text: 'Hello!' }]);
    }) as typeof fetch;
    const r = await runChat(req('hi'), deps(f, { hedgeAfterMs: 10, timeoutMs: 5000 }));
    expect(r).toMatchObject({ kind: 'reply', text: 'Hello!' });
    expect(n).toBe(2);
    expect(first?.aborted).toBe(true);
  });
});

describe('contentsFromMessages', () => {
  it('merges roles, drops a leading assistant greeting, and summarises research cards with refs', () => {
    const c = contentsFromMessages([
      { role: 'assistant', text: 'Hi! How much money do you have?' },
      { role: 'user', text: 'find rates' },
      {
        role: 'assistant', text: 'Here they are.',
        cards: [{ id: 'x', type: 'research_results', actions: [], topic: 'savings_rates', query: 'q', retrievedAt: 't', sample: false, label: 'l', items: [{ ref: 'r-1-0', provider: 'Bank', product: 'Saver', headline: '4% AER', conditions: [], sourceUrl: 'https://a', sourceTitle: 'a' }] }],
      },
      { role: 'user', text: 'use the first one' },
      { role: 'user', text: 'for savings' },
    ]);
    expect(c.map((x) => x.role)).toEqual(['user', 'model', 'user']);
    expect(c[1].parts[0].text).toContain('ref r-1-0');
    expect(c[2].parts).toHaveLength(2);
  });
});
