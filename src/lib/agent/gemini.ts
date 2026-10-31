/** Minimal Gemini REST client for the agent. The key goes only in the x-goog-api-key header; responses are zod-validated. */
import { z } from 'zod';

export const CHAT_MODEL = 'gemini-4-argon';
export const CHAT_TIMEOUT_MS = 25_000;
const endpointFor = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Parts are kept loose so unknown fields (thoughtSignature, thought, future keys) survive an exact replay. */
const PartSchema = z.looseObject({
  text: z.string().optional(),
  thought: z.boolean().optional(),
  thoughtSignature: z.string().optional(),
  functionCall: z.looseObject({ name: z.string(), args: z.record(z.string(), z.unknown()).optional(), id: z.string().optional() }).optional(),
});
export type GeminiPart = z.infer<typeof PartSchema> & {
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
};
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

const GroundingChunkSchema = z.looseObject({ web: z.looseObject({ uri: z.string().optional(), title: z.string().optional() }).optional() });
const GroundingSupportSchema = z.looseObject({
  segment: z.looseObject({ startIndex: z.number().optional(), endIndex: z.number().optional(), text: z.string().optional() }).optional(),
  groundingChunkIndices: z.array(z.number()).optional(),
});
export const GroundingMetadataSchema = z.looseObject({
  groundingChunks: z.array(GroundingChunkSchema).optional(),
  groundingSupports: z.array(GroundingSupportSchema).optional(),
  webSearchQueries: z.array(z.string()).optional(),
});
export type GroundingMetadata = z.infer<typeof GroundingMetadataSchema>;

export const GenerateResponseSchema = z.looseObject({
  candidates: z
    .array(
      z.looseObject({
        content: z.looseObject({ role: z.string().optional(), parts: z.array(PartSchema).optional() }).optional(),
        finishReason: z.string().optional(),
        groundingMetadata: GroundingMetadataSchema.optional(),
      }),
    )
    .optional(),
  promptFeedback: z.looseObject({ blockReason: z.string().optional() }).optional(),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number, readonly timeout = false) {
    super(message);
    this.name = 'GeminiError';
  }
}

export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** External cancellation (e.g. the losing side of a hedged race). */
  signal?: AbortSignal;
}

export async function generateContent(o: GeminiCallOptions): Promise<GenerateResponse> {
  const f = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? CHAT_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  if (o.signal?.aborted) ctl.abort();
  o.signal?.addEventListener('abort', onAbort);
  try {
    let res: Response;
    try {
      res = await f(endpointFor(o.model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: JSON.stringify(o.body),
        signal: ctl.signal,
      });
    } catch (e) {
      if (o.signal?.aborted) throw new GeminiError('Model call cancelled');
      if (ctl.signal.aborted) throw new GeminiError('Model call timed out', undefined, true);
      throw new GeminiError(`Network error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    if (!res.ok) throw new GeminiError(`HTTP ${res.status}`, res.status);
    const parsed = GenerateResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new GeminiError('Unexpected model response shape');
    return parsed.data;
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

/** The visible text of a candidate (thought parts excluded). */
export function visibleText(parts: GeminiPart[] | undefined): string {
  return (parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
}

/**
 * Tail-latency hedge: runs `fn`, and if it has not settled after `hedgeAfterMs`, starts a second identical attempt.
 * The first success wins and the other is cancelled. A failure before the hedge starts is returned as is (callers keep
 * their own retry policy); once both are running, the call fails only when both fail.
 */
export function hedge<T>(fn: (signal: AbortSignal, attempt: number) => Promise<T>, hedgeAfterMs: number): Promise<T> {
  const ctls = [new AbortController(), new AbortController()];
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let started = 0;
    let failed = 0;
    const settle = () => {
      done = true;
      clearTimeout(timer);
      ctls.forEach((c) => c.abort());
    };
    const launch = () => {
      if (done || started >= 2) return;
      const i = started++;
      fn(ctls[i].signal, i).then(
        (v) => {
          if (done) return;
          settle();
          resolve(v);
        },
        (e: unknown) => {
          if (done) return;
          failed++;
          if (failed >= started) {
            settle();
            reject(e);
          }
        },
      );
    };
    const timer = setTimeout(launch, hedgeAfterMs);
    launch();
  });
}
