import { describe, expect, it } from 'vitest';
import { INTENT_RULES, LONDON_STUDENT_DEALS_RULE, systemPrompt } from './prompt';
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
  it('asks for a lead line plus bullets and engine-style money, and formats context money without ".00"', () => {
    const sys = systemPrompt(ctx);
    expect(sys).toMatch(/2–4 bullets/);
    expect(sys).toContain('never "£35.00"');
    expect(sys).toContain('today allowance £25.84');
    expect(sys).toContain('planned savings £150');
    expect(sys.replace('never "£35.00"', '')).not.toMatch(/£\d+\.00\b/);
  });
  it('setup: asks only income, rent and lifestyle (one at a time), then calls quick_plan', () => {
    const sys = systemPrompt({ today: '2026-10-31', demoMode: false, hasPlan: false });
    expect(sys).toMatch(/exactly THREE things/);
    expect(sys).toMatch(/ONE per turn/);
    expect(sys).toMatch(/As soon as you have all three, call quick_plan/);
    expect(sys).not.toMatch(/setup_plan/);
  });
  it('specializes for London students and instructs autonomous apply_deal usage', () => {
    const sys = systemPrompt(ctx);
    expect(sys).toContain(LONDON_STUDENT_DEALS_RULE);
    expect(sys).toMatch(/NeoTaste/);
    expect(sys).toMatch(/Too Good To Go/);
    expect(sys).toMatch(/AUTONOMOUSLY call apply_deal/);
  });
});
