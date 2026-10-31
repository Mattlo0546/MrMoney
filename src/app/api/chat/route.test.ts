import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiResponse } from '@/lib/agent/testkit';
import { POST } from './route';

const body = { messages: [{ role: 'user', text: 'hi' }], context: { today: '2026-10-31', demoMode: false, hasPlan: false } };
const post = (b: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/chat', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/chat', () => {
  it('400s with an error card for invalid JSON or schema', async () => {
    for (const b of ['{nope', { messages: [] }]) {
      const res = await post(b);
      expect(res.status).toBe(400);
      expect((await res.json()).cards[0].type).toBe('error');
    }
  });

  it('JSON mode returns the ChatResponse', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse([{ text: 'Hello! How much money do you have?' }])));
    const res = await post(body);
    expect(await res.json()).toMatchObject({ kind: 'reply', text: 'Hello! How much money do you have?', phase: 'done' });
  });

  it('SSE mode streams status events then exactly one final event', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse([{ text: 'Hi!' }])));
    const res = await post(body, { accept: 'text/event-stream' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    const events = text.trim().split('\n\n').map((b) => b.split('\n')[0].replace('event: ', ''));
    expect(events).toEqual(['status', 'reply']);
    expect(text).toContain('"label":"Thinking…"');
  });
});
