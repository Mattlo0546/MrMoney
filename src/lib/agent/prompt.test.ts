import { describe, expect, it } from 'vitest';
import { INTENT_RULES, systemPrompt } from './prompt';
import { functionDeclarations } from './tools';

const ctx = { today: '2026-11-10', demoMode: true, hasPlan: true, summary: { todayAllowancePence: 2584, plannedSavingsPence: 15000, reservePence: 50000 } };

describe('system prompt: D17 committed vs hypothetical spending', () => {
  const sys = systemPrompt(ctx);
  it('maps "I need to / have to / I\'ve got to spend ... today" to record_expense, with the demo sentence as an example', () => {
    expect(sys).toContain(INTENT_RULES);
    expect(INTENT_RULES).toContain("\"I need to / have to / I've got to / I must / I'm going to spend|pay|buy ... today\"");
    expect(INTENT_RULES).toContain('"I need to spend £35 on a shower filter today" -> record_expense');
    expect(INTENT_RULES).toMatch(/Committed spending -> record_expense, never check_purchase/);
  });
  it('keeps check_purchase for questions and affordability wording only', () => {
    for (const phrase of ['"can I"', '"could I afford"', '"is it ok to"', 'ending in "?"']) expect(INTENT_RULES).toContain(phrase);
    expect(INTENT_RULES).toContain('"Can I spend £20 on dinner tomorrow?" -> check_purchase');
  });
  it('the tool descriptions agree with the prompt', () => {
    const d = Object.fromEntries(functionDeclarations().map((x) => [x.name, x.description]));
    expect(d.record_expense).toMatch(/I need to \/ have to spend/);
    expect(d.check_purchase).toMatch(/^Only for questions/);
  });
});

describe('system prompt: style and context', () => {
  it('asks for 1–2 sentences and engine-style money, and formats context money without ".00"', () => {
    const sys = systemPrompt(ctx);
    expect(sys).toMatch(/1–2 short sentences/);
    expect(sys).toContain('never "£35.00"');
    expect(sys).toContain('today allowance £25.84');
    expect(sys).toContain('planned savings £150');
    expect(sys.replace('never "£35.00"', '')).not.toMatch(/£\d+\.00\b/);
  });
  it('setup: sets up straight away when funds and end date are known, otherwise asks ONE question', () => {
    const sys = systemPrompt({ today: '2026-10-31', demoMode: false, hasPlan: false });
    expect(sys).toMatch(/If the first message has both, call setup_plan straight away/);
    expect(sys).toMatch(/ask_user with ONE short question/);
  });
});
