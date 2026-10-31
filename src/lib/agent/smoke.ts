/**
 * Live smoke test (real Gemini calls). Run:
 *   pnpm dlx tsx --env-file=.env.local src/lib/agent/smoke.ts
 * Simulates the client: runs runChat, executes client tools against the real engine where cheap (setup_plan),
 * and loops until a reply. Never prints the key.
 */
import { generatePlan, type EngineState } from '@/lib/engine';
import { runChat } from './loop';
import { buildSetupPayload } from './setup';
import { stateSecret } from './state';
import { SetupPlanArgsSchema, type ChatContext, type ChatMessage, type ChatResponse, type ToolResult } from './types';

const TODAY = '2026-10-31';
const deps = {
  apiKey: process.env.GEMINI_API_KEY,
  secret: stateSecret(),
  onStatus: (s: { phase: string; label: string; step: number }) => console.log(`   · status step ${s.step}: ${s.label} (+${Date.now() - t0}ms)`),
};
let t0 = Date.now();

function execClient(call: Extract<ChatResponse, { kind: 'tool_calls' }>['calls'][number]): ToolResult {
  if (call.name === 'setup_plan') {
    const args = SetupPlanArgsSchema.parse(call.args);
    const { profile, commitments, incomes } = buildSetupPayload(args, TODAY);
    const state: EngineState = { schemaVersion: 1, profile, commitments, incomes, ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null };
    try {
      const plan = generatePlan(state, TODAY);
      const s = plan.summary;
      return { id: call.id, name: call.name, ok: true, result: { todayAllowancePence: s.todayAllowance.pence, flexibleRemainingPence: s.flexibleRemaining.pence, reservedForCommitmentsPence: s.reservedForCommitments.pence, reservePence: s.reserve.pence, deficits: plan.deficits.map((d) => d.reason) } };
    } catch (e) {
      return { id: call.id, name: call.name, ok: false, error: e instanceof Error ? e.message : 'engine error' };
    }
  }
  return { id: call.id, name: call.name, ok: true, result: { note: 'smoke: not executed' } };
}

async function turn(label: string, messages: ChatMessage[], context: ChatContext) {
  console.log(`\n=== ${label}\n> ${messages[messages.length - 1].text}`);
  t0 = Date.now();
  let res = await runChat({ messages, context }, deps);
  while (res.kind === 'tool_calls') {
    console.log(`   tool_calls (step ${res.step}, +${Date.now() - t0}ms): ${JSON.stringify(res.calls)}`);
    if (res.assistantDraft) console.log(`   draft: ${res.assistantDraft}`);
    const toolResults = res.calls.map(execClient);
    console.log(`   client results: ${JSON.stringify(toolResults)}`);
    res = await runChat({ messages, context, toolResults, modelState: res.modelState }, deps);
  }
  console.log(`   REPLY (+${Date.now() - t0}ms, phase ${res.phase}): ${res.text}`);
  for (const c of res.cards) {
    if (c.type === 'research_results') {
      console.log(`   card research_results sample=${c.sample} model=${c.model ?? '-'} retrievedAt=${c.retrievedAt} items=${c.items.length}`);
      for (const i of c.items) console.log(`     - [${i.ref}] ${i.provider} | ${i.product} | ${i.headline}${i.ratePercent !== undefined ? ` (rate ${i.ratePercent})` : ''} | ${i.sourceTitle} | ${i.sourceUrl.slice(0, 70)}…`);
    } else console.log(`   card ${c.type}: ${JSON.stringify(c)}`);
  }
  return res;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const noPlan: ChatContext = { today: TODAY, demoMode: false, hasPlan: false };
  await turn('1. setup interview', [{ role: 'user', text: "Hi, I'm an international student, I have £3,900 to last until end of January, rent £620 on the 1st" }], noPlan);

  const withPlan: ChatContext = {
    today: TODAY, demoMode: false, hasPlan: true,
    summary: { todayAllowancePence: 2104, flexibleRemainingPence: 193600, reservePence: 20000, horizonEnd: '2027-01-31' },
    categories: [{ id: 'groceries', name: 'Groceries' }, { id: 'transport', name: 'Transport' }, { id: 'eating-out', name: 'Eating out' }],
  };
  await turn('2. research (cold)', [{ role: 'user', text: 'find me the best easy-access savings rate' }], withPlan);
  await turn('3. research (cached)', [{ role: 'user', text: 'find me the best easy-access savings rate' }], withPlan);
}

main().catch((e) => {
  console.error('smoke failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
