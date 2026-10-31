/**
 * Live smoke test (real Gemini calls). Run:
 *   pnpm dlx tsx --env-file=.env.local src/lib/agent/smoke.ts
 * Simulates the client: runs runChat, executes client tools against the real engine where cheap (setup_plan),
 * and loops until a reply. Never prints the key.
 */
import { applyIntent, demoFixture, explain, gbp, generatePlan, previewIntent, type EngineState, type Intent } from '@/lib/engine';
import { runChat } from './loop';
import { clearResearchCache, runResearch } from './research';
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

/** `smoke.ts research [N]`: N cold research runs with a stage trace (diagnosis of 0-item results). */
async function researchRuns(n: number) {
  const stats: { ok: boolean; items: number; ms: number; model?: string }[] = [];
  for (let i = 1; i <= n; i++) {
    clearResearchCache();
    const start = Date.now();
    console.log(`\n=== research run ${i}/${n}`);
    const r = await runResearch({ topic: 'savings_rates', query: 'best easy-access savings rate' }, {
      apiKey: process.env.GEMINI_API_KEY, today: TODAY, ...(process.env.SMOKE_MODEL ? { model: process.env.SMOKE_MODEL } : {}),
      trace: (ev, data) => {
        const d = { ...data };
        const long = (k: string) => { if (typeof d[k] === 'string' && !process.env.SMOKE_VERBOSE) d[k] = `${(d[k] as string).slice(0, 160).replace(/\n/g, ' ')}…`; };
        long('text'); long('raw');
        console.log(`   · ${ev} +${Date.now() - start}ms ${JSON.stringify(d)}`);
      },
    });
    const ms = Date.now() - start;
    stats.push({ ok: !r.sample && r.items.length >= 3, items: r.items.length, ms, model: r.model });
    console.log(`   RESULT sample=${r.sample} items=${r.items.length} model=${r.model ?? '-'} ${ms}ms`);
    for (const it of r.items) console.log(`     - ${it.provider} | ${it.product} | ${it.headline}${it.ratePercent !== undefined ? ` (rate ${it.ratePercent})` : ''} | ${it.sourceTitle}`);
  }
  const ok = stats.filter((s) => s.ok).length;
  console.log(`\nSUMMARY ${ok}/${n} runs with >=3 cited items; times ${stats.map((s) => `${(s.ms / 1000).toFixed(1)}s(${s.items},${s.model ?? 'sample'})`).join(' ')}`);
}


// ------------------------------------------------------------------ latency bench (`smoke.ts bench [runs]`)

function demoContext(st: EngineState, today: string): ChatContext {
  const s = st.plan!.summary;
  return {
    today, demoMode: true, hasPlan: true,
    summary: {
      balancePence: s.balance.pence, todayAllowancePence: s.todayAllowance.pence, todayRemainingPence: s.todayRemaining.pence, todaySpentPence: s.todaySpent.pence,
      flexibleRemainingPence: s.flexibleRemaining.pence, reservedForCommitmentsPence: s.reservedForCommitments.pence, reservePence: s.reserve.pence,
      plannedSavingsPence: s.plannedSavings.pence, futureIncomePence: s.futureIncome.pence, planStart: st.profile.planStart, horizonEnd: st.profile.horizonEnd,
    },
    categories: st.profile.categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

/** Mirrors src/components/chat/bridge.ts closely enough for timing: real engine numbers and explanation sentences. */
function execDemo(st: EngineState, today: string, call: Extract<ChatResponse, { kind: 'tool_calls' }>['calls'][number]): ToolResult {
  const k = `bench-${Math.random()}`;
  const short = (x: EngineState) => ({ todayRemainingPence: x.plan!.summary.todayRemaining.pence, flexibleRemainingPence: x.plan!.summary.flexibleRemaining.pence });
  const commit = (intent: Intent): ToolResult => {
    const r = applyIntent(st, intent, today);
    if (!r.ok) return { id: call.id, name: call.name, ok: false, error: r.error?.message ?? 'failed' };
    return { id: call.id, name: call.name, ok: true, result: { applied: true, changeId: '1', explanation: explain(r.diff).sentence, summary: short(r.nextState), undoAvailable: true } };
  };
  const cat = (c: string) => (st.profile.categories.find((x) => x.id === c || x.name.toLowerCase() === c.toLowerCase())?.id ?? c);
  if (call.name === 'record_expense') return commit({ kind: 'expense', idempotencyKey: k, amount: gbp(call.args.amountPence), date: call.args.date, category: cat(call.args.category), note: call.args.note });
  if (call.name === 'record_income') return commit({ kind: 'income', idempotencyKey: k, amount: gbp(call.args.amountPence), date: call.args.date, note: call.args.label });
  if (call.name === 'check_purchase') {
    const c = cat(call.args.category);
    const pv = previewIntent(st, { kind: 'hypothetical', idempotencyKey: k, amount: gbp(call.args.amountPence), date: call.args.date, category: st.profile.categories.some((x) => x.id === c) ? c : 'eating-out', label: call.args.label }, today);
    const aff = pv.affordability;
    return {
      id: call.id, name: call.name, ok: true,
      result: {
        status: 'preview shown, awaiting user', note: 'Nothing is committed. The user taps Apply or Discard on the card.', previewId: 'p1',
        ...(aff ? { fits: aff.fits, message: aff.message } : {}),
        explanation: aff ? (aff.fits ? aff.preview.explanation.sentence : aff.message ?? '') : pv.ok ? explain(pv.diff).sentence : '',
      },
    };
  }
  return { id: call.id, name: call.name, ok: true, result: { note: 'bench: not executed' } };
}

async function benchTurn(label: string, text: string, context: ChatContext, exec: (c: Extract<ChatResponse, { kind: 'tool_calls' }>['calls'][number]) => ToolResult) {
  const messages: ChatMessage[] = [{ role: 'user', text }];
  const start = Date.now();
  let modelSteps = 0;
  const tools: string[] = [];
  const d = { ...deps, onStatus: (s: { phase: string; step: number }) => { if (s.phase === 'thinking') modelSteps++; } };
  let res = await runChat({ messages, context }, d);
  while (res.kind === 'tool_calls') {
    tools.push(...res.calls.map((c) => c.name));
    const toolResults = res.calls.map(exec);
    res = await runChat({ messages, context, toolResults, modelState: res.modelState }, d);
  }
  const ms = Date.now() - start;
  const research = res.cards.find((c) => c.type === 'research_results');
  const extra = research && research.type === 'research_results' ? ` research items=${research.items.length} sample=${research.sample}` : '';
  console.log(`[${label}] ${(ms / 1000).toFixed(1)}s modelCalls=${modelSteps} tools=${tools.join(',') || '-'}${extra}\n    reply: ${res.text}`);
  return { label, ms, tools, text: res.text };
}

async function bench(runs: number) {
  const all: { label: string; ms: number }[] = [];
  for (let r = 1; r <= runs; r++) {
    console.log(`\n##### bench run ${r}/${runs}`);
    clearResearchCache();
    const noPlan: ChatContext = { today: TODAY, demoMode: false, hasPlan: false };
    all.push(await benchTurn('setup', "Hi, I'm an international student, I have £3,900 to last until end of January, rent £620 on the 1st", noPlan, execClient));
    const { state, today } = demoFixture();
    const ctx = demoContext(state, today);
    const ex = (c: Parameters<typeof execDemo>[2]) => execDemo(state, today, c);
    all.push(await benchTurn('expense £35', 'I need to spend £35 on a shower filter today', ctx, ex));
    all.push(await benchTurn('dinner £20?', 'Can I spend £20 on dinner tomorrow?', ctx, ex));
    all.push(await benchTurn('income £200', 'I got paid £200 today', ctx, ex));
    all.push(await benchTurn('research', 'find me the best easy-access savings rate', ctx, ex));
  }
  console.log('\nBENCH SUMMARY');
  for (const label of [...new Set(all.map((a) => a.label))]) {
    const xs = all.filter((a) => a.label === label).map((a) => a.ms / 1000);
    console.log(`  ${label.padEnd(12)} ${xs.map((x) => x.toFixed(1)).join('s, ')}s  mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}s`);
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  if (process.argv[2] === 'research') return researchRuns(Number(process.argv[3] ?? 6));
  if (process.argv[2] === 'bench') return bench(Number(process.argv[3] ?? 2));
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
