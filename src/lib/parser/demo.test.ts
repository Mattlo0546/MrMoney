import { describe, expect, it } from 'vitest';
import { DemoParser } from './demo';
import type { ParseContext } from './types';

// 2026-11-10 is a Tuesday.
const ctx: ParseContext = {
  today: '2026-11-10',
  demoMode: true,
  categories: [
    { id: 'groceries', name: 'Groceries' }, { id: 'transport', name: 'Transport' },
    { id: 'eating-out', name: 'Eating out' }, { id: 'shopping', name: 'Shopping' },
  ],
};
const p = new DemoParser();
const run = (t: string, c: ParseContext = ctx) => p.parse(t, c);

async function intent(t: string) {
  const r = await run(t);
  if (r.kind !== 'intent') throw new Error(`expected intent for "${t}", got ${JSON.stringify(r)}`);
  expect(r.source).toBe('demo');
  return r.intent;
}
async function clarifies(t: string) {
  const r = await run(t);
  if (r.kind !== 'clarify') throw new Error(`expected clarify for "${t}", got ${JSON.stringify(r)}`);
  return r;
}

describe('DemoParser expenses', () => {
  it('PRD example', async () => {
    expect(await intent('I spent £35 on a shower filter today')).toMatchObject({
      kind: 'expense', amount: { pence: 3500, currency: 'GBP' }, date: '2026-11-10', category: 'household',
    });
  });
  it.each([
    ['spent £35 on a shower filter', 3500],
    ['I spent 35 on a shower filter', 3500],
    ['I spent 35.50 on lunch', 3550],
    ['I paid £1,200 for a laptop', 120000],
    ['I spent 35 quid on groceries', 3500],
    ['just bought a £12.99 book', 1299],
  ])('amount: %s', async (t, pence) => {
    const i = await intent(t);
    expect(i.kind).toBe('expense');
    expect((i as { amount: { pence: number } }).amount.pence).toBe(pence);
  });
  it('categories', async () => {
    const cat = async (t: string) => (await intent(t) as { category: string }).category;
    expect(await cat('I spent £8 on lunch today')).toBe('eating-out');
    expect(await cat('I paid £3 for the bus')).toBe('transport');
    expect(await cat('spent £40 at Tesco')).toBe('groceries');
    expect(await cat('I bought a £15 textbook')).toBe('books');
    expect(await cat('I spent £20 on a jacket')).toBe('shopping');
    expect(await cat('I topped up my oyster, spent £10')).toBe('transport');
  });
  it('past weekday resolves backwards, yesterday works', async () => {
    expect(await intent('I spent £10 on lunch on Monday')).toMatchObject({ date: '2026-11-09' });
    expect(await intent('I spent £10 on lunch yesterday')).toMatchObject({ date: '2026-11-09' });
    expect(await intent('I spent £10 on lunch last friday')).toMatchObject({ date: '2026-11-06' });
  });
  it('defaults to today', async () => {
    expect(await intent('I spent £5 on coffee')).toMatchObject({ date: '2026-11-10', category: 'eating-out' });
  });
});

describe('DemoParser committed expenses (D17)', () => {
  it('PRD sentence is an expense', async () => {
    expect(await intent('I need to spend £35 on a replacement shower filter today')).toMatchObject({
      kind: 'expense', amount: { pence: 3500 }, date: '2026-11-10', category: 'household',
    });
  });
  it.each(['I have to spend £20 on groceries today', "I've got to pay £20 for the train today", 'I need to buy a £20 jacket today'])(
    'committed: %s', async (s) => {
      expect((await intent(s)).kind).toBe('expense');
    });
  it('"I want to buy" without a question clarifies', async () => {
    await clarifies('I want to buy a £30 jacket');
  });
});

describe('DemoParser hypotheticals', () => {
  it('PRD example: dinner tomorrow', async () => {
    expect(await intent('Can I spend £20 on dinner tomorrow?')).toMatchObject({
      kind: 'hypothetical', amount: { pence: 2000 }, date: '2026-11-11', category: 'eating-out',
    });
  });
  it('afford a concert ticket on saturday', async () => {
    expect(await intent('can i afford a £60 concert ticket on saturday')).toMatchObject({
      kind: 'hypothetical', amount: { pence: 6000 }, date: '2026-11-14',
    });
  });
  it('"can I spend" the PRD amount stays hypothetical', async () => {
    expect(await intent('can I spend £35 on a replacement shower filter today')).toMatchObject({
      kind: 'hypothetical', amount: { pence: 3500 }, date: '2026-11-10', category: 'household',
    });
  });
  it('trailing ? keeps "I need to spend" hypothetical', async () => {
    expect((await intent('I need to spend £35 on a shower filter today?')).kind).toBe('hypothetical');
  });
  it.each([
    ['what if I buy a £30 jacket on friday', '2026-11-13'],
    ['Could I spend £15 on lunch on the 14th of November', '2026-11-14'],
    ['can I afford £8 for the train on 2026-11-20', '2026-11-20'],
    ['Can I spend £25 on dinner next month?', '2060-01-01'],
  ])('date: %s', async (t, date) => {
    const r = await run(t);
    expect(r.kind).toBe('intent');
    if (date !== '2060-01-01') expect((r as { intent: { date: string } }).intent.date).toBe(date);
    else expect((r as { intent: { date: string } }).intent.date).toBe('2026-12-10');
  });
  it('same weekday means next week', async () => {
    expect(await intent('Can I spend £20 on dinner on Tuesday?')).toMatchObject({ date: '2026-11-17' });
  });
  it('missing date clarifies', async () => {
    const r = await clarifies('Can I spend £20 on dinner?');
    expect(r.missing).toEqual(['date']);
  });
});

describe('DemoParser income', () => {
  it('PRD example', async () => {
    expect(await intent('I received an extra £200')).toMatchObject({
      kind: 'income', amount: { pence: 20000 }, date: '2026-11-10',
    });
  });
  it('variants', async () => {
    expect(await intent('my mum sent me £50')).toMatchObject({ kind: 'income', amount: { pence: 5000 } });
    expect(await intent('I got paid £120.50 today')).toMatchObject({ kind: 'income', amount: { pence: 12050 } });
    expect(await intent('I received a £75 refund')).toMatchObject({ kind: 'income', amount: { pence: 7500 } });
  });
});

describe('DemoParser commitment changes', () => {
  it('PRD example', async () => {
    expect(await intent('My rent increases by £50 next month')).toMatchObject({
      kind: 'commitmentChange',
      change: { op: 'adjust', target: 'rent', delta: { pence: 5000 }, effectiveFrom: '2026-12-01' },
    });
  });
  it('decrease is negative', async () => {
    expect(await intent('my phone bill goes down by £5 next month')).toMatchObject({
      change: { op: 'adjust', target: 'phone', delta: { pence: -500 } },
    });
  });
  it('set', async () => {
    expect(await intent('my rent will be £700 from next month')).toMatchObject({
      change: { op: 'set', target: 'rent', amount: { pence: 70000 }, effectiveFrom: '2026-12-01' },
    });
    expect(await intent('rent goes from £620 to £670 next month')).toMatchObject({
      change: { op: 'set', amount: { pence: 67000 } },
    });
  });
  it('no date clarifies', async () => {
    expect((await clarifies('my rent increases by £50')).missing).toEqual(['date']);
  });
});

describe('DemoParser preferences and goals', () => {
  it('PRD preference', async () => {
    expect(await intent('Keep £30 available for Saturday')).toMatchObject({
      kind: 'preference', amount: { pence: 3000 }, date: '2026-11-14',
    });
  });
  it('preference variants', async () => {
    expect(await intent('keep £25 free for tomorrow')).toMatchObject({ kind: 'preference', date: '2026-11-11' });
    expect((await clarifies('keep £30 available')).missing).toEqual(['date']);
  });
  it('PRD goal', async () => {
    expect(await intent('Save another £100 by month end')).toMatchObject({
      kind: 'goal', amount: { pence: 10000 }, byDate: '2026-11-30',
    });
  });
  it('goal variant', async () => {
    expect(await intent('I want to save another £100 by the end of the month')).toMatchObject({
      kind: 'goal', amount: { pence: 10000 }, byDate: '2026-11-30',
    });
  });
  it('goal without date', async () => {
    const i = await intent('I want to save an extra £50');
    expect(i).toMatchObject({ kind: 'goal', amount: { pence: 5000 } });
    expect('byDate' in i).toBe(false);
  });
});

describe('DemoParser clarifications', () => {
  it.each([
    ['I spent $35 on a shower filter', 'currency'],
    ['can I spend €20 on dinner tomorrow', 'currency'],
    ['I received 200 dollars', 'currency'],
    ['I spent 30 euros on food', 'currency'],
  ])('non-GBP: %s', async (t, f) => {
    const r = await clarifies(t);
    expect(r.missing).toEqual([f]);
    expect(r.question).toMatch(/never converts/i);
  });
  it.each([
    ['I spent money on a shower filter', 'amount'],
    ['Can I spend some money on dinner tomorrow?', 'amount'],
    ['I received some extra cash', 'amount'],
    ['save more', 'amount'],
  ])('missing amount: %s', async (t, f) => {
    expect((await clarifies(t)).missing).toContain(f);
  });
  it('ambiguous actual vs hypothetical', async () => {
    expect((await clarifies('£35 shower filter today')).missing).toEqual(['intent']);
  });
  it('gibberish and empty', async () => {
    expect((await clarifies('hello there')).missing).toEqual(['intent']);
    expect((await clarifies('   ')).missing).toEqual(['intent']);
  });
});

describe('DemoParser misc', () => {
  it('never returns an intent without idempotencyKey and keys differ', async () => {
    const a = await intent('I spent £5 on coffee');
    const b = await intent('I spent £5 on coffee');
    expect(a.idempotencyKey).toBeTruthy();
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
  it('amounts are integer pence', async () => {
    const i = (await intent('I spent £19.99 on dinner')) as { amount: { pence: number } };
    expect(Number.isInteger(i.amount.pence)).toBe(true);
    expect(i.amount.pence).toBe(1999);
  });
  it('relative dates counted from ctx.today', async () => {
    const other = { ...ctx, today: '2026-12-31' };
    const r = await run('Can I spend £20 on dinner tomorrow?', other);
    expect(r.kind === 'intent' && r.intent).toMatchObject({ date: '2027-01-01' });
    const r2 = await run('I want to save another £100 by the end of the month', other);
    expect(r2.kind === 'intent' && r2.intent).toMatchObject({ byDate: '2026-12-31' });
  });
  it('uses ctx category ids when user-defined', async () => {
    const c: ParseContext = { ...ctx, categories: [...ctx.categories, { id: 'gym', name: 'Gym' }] };
    const r = await run('I spent £20 on gym', c);
    expect(r.kind === 'intent' && r.intent).toMatchObject({ category: 'gym' });
  });
});
