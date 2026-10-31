import { describe, expect, it } from 'vitest';
import { generatePlan, type EngineState } from '@/lib/engine';
import { buildSetupPayload } from './setup';
import { functionDeclarations } from './tools';
import {
  ApplyDealArgsSchema, ChangeCommitmentArgsSchema, ChatRequestSchema, CLIENT_TOOL_NAMES, SetupPlanArgsSchema, ToolResultSchema,
} from './types';

const valid = {
  messages: [{ role: 'user', text: 'hi' }],
  context: { today: '2026-10-31', demoMode: false, hasPlan: false },
};

describe('ChatRequestSchema', () => {
  it('accepts a minimal request and a continuation', () => {
    expect(ChatRequestSchema.safeParse(valid).success).toBe(true);
    expect(ChatRequestSchema.safeParse({ ...valid, toolResults: [{ id: 'c1', name: 'undo_last', ok: true }], modelState: 'abc.def', stream: true }).success).toBe(true);
  });
  it('accepts summary, planDigest and categories', () => {
    const r = ChatRequestSchema.safeParse({
      ...valid,
      context: {
        ...valid.context, hasPlan: true,
        summary: { todayAllowancePence: 2584, horizonEnd: '2027-01-31' },
        planDigest: { bills: [{ name: 'Rent', amountPence: 62000, date: '2026-11-01' }], next14: [{ date: '2026-10-31', plannedPence: 2584 }] },
        categories: [{ id: 'groceries', name: 'Groceries' }],
      },
    });
    expect(r.success).toBe(true);
  });
  it.each([
    ['no messages', { ...valid, messages: [] }],
    ['bad role', { ...valid, messages: [{ role: 'system', text: 'x' }] }],
    ['bad today', { ...valid, context: { ...valid.context, today: '2026-02-30' } }],
    ['missing hasPlan', { ...valid, context: { today: '2026-10-31', demoMode: false } }],
    ['unknown tool result', { ...valid, toolResults: [{ id: 'c', name: 'rm_rf', ok: true }] }],
    ['too many messages', { ...valid, messages: Array.from({ length: 61 }, () => ({ role: 'user', text: 'x' })) }],
    ['non-integer pence', { ...valid, context: { ...valid.context, summary: { balancePence: 1.5 } } }],
  ])('rejects %s', (_, body) => {
    expect(ChatRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('client tool arg schemas', () => {
  const setup = {
    funds: 390000, fundsType: 'lump', horizonEnd: '2027-01-31',
    commitments: [{ name: 'Rent', amountPence: 62000, recurrence: 'monthly', dayOfMonth: 1 }],
    incomes: [], minimumReserve: 20000, savingsGoal: 0, foodWeeklyPence: 3500, transportWeeklyPence: 1200, priorities: ['eating-out'],
  };
  it('setup_plan: valid; monthly commitments need a day; pence are integers', () => {
    expect(SetupPlanArgsSchema.safeParse(setup).success).toBe(true);
    expect(SetupPlanArgsSchema.safeParse({ ...setup, commitments: [{ name: 'Rent', amountPence: 62000, recurrence: 'monthly' }] }).success).toBe(false);
    expect(SetupPlanArgsSchema.safeParse({ ...setup, funds: 3900.5 }).success).toBe(false);
    expect(SetupPlanArgsSchema.safeParse({ ...setup, priorities: ['crypto'] }).success).toBe(false);
  });
  it('change_commitment and apply_deal need exactly one amount form', () => {
    expect(ChangeCommitmentArgsSchema.safeParse({ name: 'Rent', deltaPence: 4000, effectiveFrom: '2026-12-01' }).success).toBe(true);
    expect(ChangeCommitmentArgsSchema.safeParse({ name: 'Rent', deltaPence: 4000, newAmountPence: 66000, effectiveFrom: '2026-12-01' }).success).toBe(false);
    expect(ApplyDealArgsSchema.safeParse({ category: 'eating-out', percentOff: 25, dealRef: 'r-1-0' }).success).toBe(true);
    expect(ApplyDealArgsSchema.safeParse({ percentOff: 25, dealRef: 'r-1-0' }).success).toBe(false);
  });
  it('ToolResult names are the client tools', () => {
    for (const name of CLIENT_TOOL_NAMES) expect(ToolResultSchema.safeParse({ id: 'x', name, ok: true }).success).toBe(true);
  });
  it('function declarations cover every client tool plus research and ask_user, without $schema', () => {
    const decls = functionDeclarations();
    expect(decls.map((d) => d.name).sort()).toEqual([...CLIENT_TOOL_NAMES, 'research', 'ask_user'].sort());
    for (const d of decls) expect(d.parametersJsonSchema).not.toHaveProperty('$schema');
  });
});

describe('buildSetupPayload (reuses the onboarding builder)', () => {
  it('produces a profile the engine can plan', () => {
    const args = SetupPlanArgsSchema.parse({
      funds: 390000, fundsType: 'lump', horizonEnd: '2027-01-31',
      commitments: [{ name: 'Rent', amountPence: 62000, recurrence: 'monthly', dayOfMonth: 1 }],
      incomes: [{ label: 'Café shifts', amountPence: 30000, date: '2026-11-28', confirmed: true, source: 'job' }],
      minimumReserve: 20000, savingsGoal: 0, foodWeeklyPence: 3500, transportWeeklyPence: 1200, priorities: ['social', 'eating-out'],
    });
    const p = buildSetupPayload(args, '2026-10-31');
    expect(p.profile).toMatchObject({ funds: { pence: 390000 }, horizonEnd: '2027-01-31', minimumReserve: { pence: 20000 }, hasJob: true });
    expect(p.commitments[0]).toMatchObject({ name: 'Rent', amount: { pence: 62000 }, recurrence: { kind: 'monthly', dayOfMonth: 1 }, locked: true });
    expect(p.incomes[0]).toMatchObject({ amount: { pence: 30000 }, confirmed: true, source: 'job', note: 'Café shifts' });
    expect(p.profile.categories.map((c) => c.id).slice(2, 4)).toEqual(['social', 'eating-out']);
    const state: EngineState = { schemaVersion: 1, ...p, ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null };
    expect(generatePlan(state, '2026-10-31').summary.todayAllowance.pence).toBeGreaterThan(0);
  });
});
