/**
 * Manual live smoke test (not part of the suite).
 *   pnpm dlx tsx --env-file=.env.local src/lib/parser/smoke.ts
 */
import { GeminiParser } from './gemini';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set (run with --env-file=.env.local)');
  process.exit(2);
}
const ctx = {
  today: '2026-11-10',
  demoMode: true,
  categories: [
    { id: 'groceries', name: 'Groceries' }, { id: 'transport', name: 'Transport' },
    { id: 'eating-out', name: 'Eating out' }, { id: 'shopping', name: 'Shopping' },
  ],
};
const env = process.env;
const parser = new GeminiParser({
  apiKey: key, fallback: false,
  model: env.SMOKE_MODEL || undefined,
  thinkingConfig: env.SMOKE_THINKING ? JSON.parse(env.SMOKE_THINKING) : undefined,
  maxOutputTokens: env.SMOKE_MAXTOK ? Number(env.SMOKE_MAXTOK) : undefined,
});
const phrases = [
  'I need to spend £35 on a replacement shower filter today',
  'I spent £35 on a shower filter today',
  'Can I spend £20 on dinner tomorrow?',
  'My rent increases by £50 next month',
  'I spent $20 on lunch',
  'can i afford a £60 concert ticket on saturday',
  'I received an extra £200',
];
const REPEAT = Number(env.SMOKE_REPEAT || 1);
async function main() {
let failed = false;
const times: number[] = [];
for (const p of phrases) {
  for (let i = 0; i < REPEAT; i++) {
    const t0 = performance.now();
    const r = await parser.parse(p, ctx);
    const ms = Math.round(performance.now() - t0);
    times.push(ms);
    if (r.kind === 'error') failed = true;
    if (i === 0) console.log(JSON.stringify({ p, ms, r }));
    else console.log(`  ${ms}ms`);
  }
}
console.log(`timings ms: ${times.join(',')} avg=${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}`);
process.exit(failed ? 1 : 0);
}
void main();
