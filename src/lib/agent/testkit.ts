/** Test helpers: a scripted fetch mock for Gemini. Not used at runtime. */
import type { GeminiPart } from './gemini';

export interface FetchCall {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Responder = (call: FetchCall) => Response | Promise<Response>;

export function geminiResponse(parts: GeminiPart[], extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', ...extra }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

/** fetch mock that answers each call with the next scripted responder (the last one repeats). */
export function scriptedFetch(script: Responder[]) {
  const calls: FetchCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const r = script[Math.min(calls.length - 1, script.length - 1)];
    return r(call);
  }) as typeof fetch;
  return { impl, calls };
}

/** A fetch that only settles when aborted (for timeout tests). */
export const hangingFetch = (async (_: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  })) as typeof fetch;
