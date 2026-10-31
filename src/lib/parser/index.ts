export * from './types';
export { DemoParser, parseDemo } from './demo';
export { GeminiParser, GEMINI_MODEL, mapGeminiOutput } from './gemini';
import { DemoParser } from './demo';
import { GeminiParser } from './gemini';
import type { IntentParser } from './types';

/** Server-side only: picks Gemini when a key exists, else the deterministic parser. */
export function createParser(env: Record<string, string | undefined> = process.env): IntentParser {
  const key = env.GEMINI_API_KEY?.trim();
  return key ? new GeminiParser({ apiKey: key }) : new DemoParser();
}
