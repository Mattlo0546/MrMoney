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
const parser = new GeminiParser({ apiKey: key, fallback: false });
const phrases = [
  'I need to spend £35 on a replacement shower filter today',
  'I spent £35 on a shower filter today',
  'Can I spend £20 on dinner tomorrow?',
  'My rent increases by £50 next month',
  'I spent $20 on lunch',
];
async function main() {
let failed = false;
for (const p of phrases) {
  const r = await parser.parse(p, ctx);
  if (r.kind === 'error') failed = true;
  console.log(JSON.stringify({ p, r }, null, 1));
}
process.exit(failed ? 1 : 0);
}
void main();
