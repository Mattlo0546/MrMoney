import { describe, expect, it, vi } from 'vitest';
import { GeminiParser } from './gemini';
import type { ParseContext } from './types';

const ctx: ParseContext = {
  today: '2026-11-10', demoMode: true,
  categories: [{ id: 'eating-out', name: 'Eating out' }, { id: 'shopping', name: 'Shopping' }],
};
const reply = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }), { status });

describe('GeminiParser (mocked fetch)', () => {
  it('maps valid output and sends key in header, not URL', async () => {
    const f = vi.fn(async () => reply({ kind: 'hypothetical', amountPence: 2000, date: '2026-11-11', category: 'eating-out', label: 'Dinner' }));
    const r = await new GeminiParser({ apiKey: 'SECRET', fetchImpl: f as unknown as typeof fetch }).parse('Can I spend £20 on dinner tomorrow?', ctx);
    expect(r).toMatchObject({ kind: 'intent', source: 'gemini', intent: { kind: 'hypothetical', amount: { pence: 2000, currency: 'GBP' }, date: '2026-11-11' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain('SECRET');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeTruthy();
  });

  it('returns clarify from Gemini', async () => {
    const f = async () => reply({ kind: 'clarify', clarifyQuestion: 'Which day?', missing: ['date'] });
    const r = await new GeminiParser({ apiKey: 'k', fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(r).toMatchObject({ kind: 'clarify', missing: ['date'], source: 'gemini' });
  });

  it('non-GBP currency from Gemini becomes clarify', async () => {
    const f = async () => reply({ kind: 'expense', amountPence: 2000, currency: 'USD' });
    const r = await new GeminiParser({ apiKey: 'k', fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(r).toMatchObject({ kind: 'clarify', missing: ['currency'] });
  });

  it('invalid output falls back to demo parser', async () => {
    for (const bad of ['not json', { kind: 'expense', amountPence: 35.5 }, { kind: 'nonsense' }, { kind: 'expense', amountPence: 100, date: 'tomorrow' }]) {
      const f = async () => reply(bad);
      const r = await new GeminiParser({ apiKey: 'k', fetchImpl: f as unknown as typeof fetch }).parse('I spent £35 on groceries', ctx);
      expect(r).toMatchObject({ kind: 'intent', source: 'demo', intent: { kind: 'expense', amount: { pence: 3500 } } });
    }
  });

  it('invalid output returns error when fallback disabled', async () => {
    const f = async () => reply('garbage');
    const r = await new GeminiParser({ apiKey: 'k', fallback: false, fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(r.kind).toBe('error');
  });

  it('HTTP 500 falls back, or errors without fallback, never throws', async () => {
    const f = async () => new Response('boom', { status: 500 });
    const a = await new GeminiParser({ apiKey: 'k', fetchImpl: f as unknown as typeof fetch }).parse('I spent £5 on coffee', ctx);
    expect(a).toMatchObject({ kind: 'intent', source: 'demo' });
    const b = await new GeminiParser({ apiKey: 'k', fallback: false, fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(b.kind).toBe('error');
    if (b.kind === 'error') expect(b.message).not.toContain('500');
  });

  it('times out via abort', async () => {
    const f = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      });
    const r = await new GeminiParser({ apiKey: 'k', fallback: false, timeoutMs: 20, fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(r.kind).toBe('error');
  });

  it('network failure never throws', async () => {
    const f = async () => { throw new TypeError('fetch failed'); };
    const r = await new GeminiParser({ apiKey: 'k', fallback: false, fetchImpl: f as unknown as typeof fetch }).parse('x', ctx);
    expect(r.kind).toBe('error');
  });
});
