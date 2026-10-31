/** Opaque, HMAC-signed modelState: the in-progress turn's Gemini contents (thoughtSignatures intact) plus loop bookkeeping. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GeminiContent, GeminiPart } from './gemini';
import type { ClientToolName } from './types';

export interface PendingCall {
  /** Index of the functionCall among the model's calls in this step (keeps functionResponse order). */
  index: number;
  id: string;
  name: string;
  /** Present for client calls the client must answer. */
  client?: ClientToolName;
  /** Present when the server already answered (server tool or invalid args). */
  response?: GeminiPart;
}

export interface ModelState {
  v: 1;
  iat: number;
  step: number;
  contents: GeminiContent[];
  pending: PendingCall[];
}

export const STATE_TTL_MS = 30 * 60 * 1000;
let processSecret: string | undefined;

export function stateSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.AGENT_STATE_SECRET?.trim() || env.GEMINI_API_KEY?.trim();
  if (s) return `studentplan-agent-state:${s}`;
  processSecret ??= randomBytes(32).toString('hex');
  return processSecret;
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function encodeState(state: ModelState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeState(blob: string | undefined, secret: string, now = Date.now()): ModelState | null {
  if (!blob) return null;
  const dot = blob.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = blob.slice(0, dot);
  const given = Buffer.from(blob.slice(dot + 1));
  const expected = Buffer.from(sign(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ModelState;
    if (s.v !== 1 || !Array.isArray(s.contents) || !Array.isArray(s.pending)) return null;
    if (now - s.iat > STATE_TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}
