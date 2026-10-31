/**
 * Live smoke for the lifestyle quick plan: real food-price + savings research, then the whole chat (3 answers -> quick_plan
 * -> engine -> reply). Run: pnpm dlx tsx --env-file=.env.local src/lib/lifestyle/smoke.ts [brokie|balanced|comfy|baller]
 */
import { runChat } from '@/lib/agent/loop';
import type { ChatMessage, ToolResult } from '@/lib/agent/types';
import { findLifestyleMenu } from './research';
import { buildLifestylePlan } from './setup';
import type { Lifestyle } from './types';

const apiKey = process.env.GEMINI_API_KEY;
const lifestyle = (process.argv[2] ?? 'brokie') as Lifestyle;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  let t = Date.now();
  const { menu, savingsResearch } = await findLifestyleMenu(lifestyle, { apiKey, today });
  console.log(`menu in ${Date.now() - t}ms, live=${menu.live}, savings=${menu.savings ? `${menu.savings.provider} ${menu.savings.ratePercent}%` : 'none'} (research ${savingsResearch?.sample ? 'sample' : 'live'})`);
  for (const d of menu.deals) console.log(`  ${d.origin === 'research' ? 'LIVE' : 'cat '} ${d.kind.padEnd(12)} £${(d.pricePence / 100).toFixed(2)} ${d.merchant} — ${d.name}${d.condition ? ` (${d.condition})` : ''}`);

  const messages: ChatMessage[] = [{ role: 'user', text: `I get £1,500 a month, rent is £900, and I want to live like a ${lifestyle}` }];
  const context = { today, demoMode: false, hasPlan: false };
  const deps = { apiKey, secret: 'smoke', onStatus: (s: { label: string }) => console.log(`  [${s.label}]`) };
  t = Date.now();
  const r1 = await runChat({ messages, context }, deps);
  if (r1.kind !== 'tool_calls') return console.log('reply instead of quick_plan:', r1.text);
  const call = r1.calls[0];
  console.log(`call ${call.name} in ${Date.now() - t}ms`, JSON.stringify({ ...call.args, menu: undefined }));
  if (call.name !== 'quick_plan') return;
  const plan = buildLifestylePlan(call.args, today);
  const toolResults: ToolResult[] = [{ id: call.id, name: 'quick_plan', ok: true, result: { created: true, mealsOnCalendar: true, numbers: plan.numbers, horizonEnd: plan.profile.horizonEnd, deficits: [] } }];
  t = Date.now();
  const r2 = await runChat({ messages, context, toolResults, modelState: r1.modelState }, deps);
  console.log(`reply in ${Date.now() - t}ms:\n${r2.kind === 'reply' ? r2.text : JSON.stringify(r2)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
