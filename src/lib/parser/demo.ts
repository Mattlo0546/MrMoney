import type { Intent } from '@/lib/engine/types';
import {
  addDays, endOfMonth, firstOfNextMonth, isValidISO, makeDate, sameDayNextMonth, weekday,
} from './dates';
import type { ClarifyField, IntentParser, ParseContext, ParseResult } from './types';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const gbp = (pence: number) => ({ pence, currency: 'GBP' as const });
let counter = 0;
const key = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${counter++}`;

const clarify = (question: string, missing: ClarifyField[]): ParseResult => ({
  kind: 'clarify', question, missing, source: 'demo',
});

// ---------- amounts ----------

type AmountScan = { pence: number; all: number[] } | 'foreign' | null;

export function scanAmount(t: string): AmountScan {
  if (/[$€]|\b(dollars?|euros?|usd|eur|bucks|yen|rupees?)\b/.test(t)) return 'foreign';
  const nums: { pence: number; idx: number }[] = [];
  const re = /(£\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)\s*(quid|pounds?|gbp|k\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const hasSign = !!m[1];
    const unit = m[4];
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 3);
    // skip day ordinals / clock times / years / percentages
    if (!hasSign && !unit) {
      if (/^(st|nd|rd|th)\b/.test(after) || /^\s*(%|am|pm)/.test(after) || /^[/:]/.test(after)) continue;
      if (/\b(on|the|of)\s*$/.test(t.slice(Math.max(0, m.index - 4), m.index)) && !m[3] && Number(m[2]) <= 31 && /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t.slice(m.index + m[0].length))) continue;
      if (/^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t.slice(m.index + m[0].length))) continue;
      if (/^\d{4}$/.test(m[2]) && /-$|^-/.test(t.slice(Math.max(0, m.index - 1), m.index + 5))) continue;
    }
    if (/-\d{2}$/.test(t.slice(Math.max(0, m.index - 1), m.index + m[0].length)) && !hasSign) continue; // ISO date parts
    let value = Number(m[2].replace(/,/g, '') + (m[3] ? `.${m[3]}` : ''));
    if (unit === 'k') value *= 1000;
    const pence = Math.round(value * 100);
    if (!Number.isFinite(pence) || pence <= 0) continue;
    nums.push({ pence, idx: m.index });
  }
  if (nums.length === 0) return null;
  // prefer explicit-£ amounts
  const signed = nums.filter((n) => /£/.test(t.slice(Math.max(0, n.idx), n.idx + 2)));
  const pool = signed.length ? signed : nums;
  return { pence: pool[0].pence, all: pool.map((n) => n.pence) };
}

// ---------- dates ----------

interface DateScan { date: string | null; note?: 'month' }

export function scanDate(t: string, today: string, mode: 'past' | 'future'): DateScan {
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso && isValidISO(iso[0])) return { date: iso[0] };

  if (/\bend of (the )?(next|following) month\b/.test(t)) {
    return { date: endOfMonth(firstOfNextMonth(today)) };
  }
  if (/\b(end of (the |this )?month|month[- ]?end|end of month|by the end of the month)\b/.test(t)) {
    return { date: endOfMonth(today) };
  }
  if (/\bnext month\b/.test(t)) return { date: sameDayNextMonth(today), note: 'month' };
  if (/\bthis month\b/.test(t) && /\b(save|goal)\b/.test(t)) return { date: endOfMonth(today) };

  if (/\bday after tomorrow\b/.test(t)) return { date: addDays(today, 2) };
  if (/\b(tomorrow|tmrw|tmw)\b/.test(t)) return { date: addDays(today, 1) };
  if (/\byesterday\b/.test(t)) return { date: addDays(today, -1) };
  if (/\b(today|tonight|this (morning|afternoon|evening)|right now|just now)\b/.test(t)) return { date: today };
  if (/\bnext week\b/.test(t)) return { date: addDays(today, 7) };

  // "14th november", "14 nov", "november 14", "14/11"
  const monthRe = MONTHS.join('|');
  let m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthRe})[a-z]*\\b`));
  let day: number | null = null, mon: number | null = null;
  if (m) { day = Number(m[1]); mon = MONTHS.indexOf(m[2]) + 1; }
  else {
    m = t.match(new RegExp(`\\b(${monthRe})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (m) { mon = MONTHS.indexOf(m[1]) + 1; day = Number(m[2]); }
    else {
      m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (m) { day = Number(m[1]); mon = Number(m[2]); }
    }
  }
  if (day && mon) {
    const [ty] = today.split('-').map(Number);
    let d = makeDate(ty, mon, day);
    if (d && mode === 'future' && d < today) d = makeDate(ty + 1, mon, day);
    if (d && mode === 'past' && d > today) d = makeDate(ty - 1, mon, day);
    return { date: d };
  }

  const wd = t.match(new RegExp(`\\b(last |next |this |on )?(${WEEKDAYS.join('|')}|${WEEKDAYS.map((w) => w.slice(0, 3)).join('|')}(?=\\b))\\b`));
  if (wd) {
    const idx = WEEKDAYS.findIndex((w) => w === wd[2] || w.slice(0, 3) === wd[2]);
    const cur = weekday(today);
    const prefix = (wd[1] ?? '').trim();
    if (prefix === 'last' || (mode === 'past' && prefix !== 'next')) {
      let back = (cur - idx + 7) % 7;
      if (prefix === 'last' && back === 0) back = 7;
      return { date: addDays(today, -back) };
    }
    let fwd = (idx - cur + 7) % 7;
    if (fwd === 0) fwd = 7;
    return { date: addDays(today, fwd) };
  }
  return { date: null };
}

// ---------- categories ----------

const CATEGORY_TABLE: { id: string; re: RegExp }[] = [
  { id: 'eating-out', re: /\b(dinner|lunch|breakfast|brunch|restaurant|takeaway|take-away|pizza|burger|kebab|nando'?s|curry|sushi|coffee|cafe|café|pub|pint|drinks?|meal|eat(ing)? out|deliveroo|uber eats|just eat|mcdonald'?s)\b/ },
  { id: 'transport', re: /\b(bus|train|oyster|tube|underground|metro|tram|uber|taxi|cab|bolt|fare|railcard|coach|petrol|bike|cycle|travel|transport|commute)\b/ },
  { id: 'groceries', re: /\b(groceries|grocery|tesco|aldi|lidl|sainsbury'?s?|asda|waitrose|morrisons|co-?op|supermarket|food shop|veg|fruit|milk|bread)\b/ },
  { id: 'books', re: /\b(books?|textbooks?|novel|stationery|notebook)\b/ },
  { id: 'entertainment', re: /\b(concert|gig|festival|cinema|movie|film|theatre|theater|club|clubbing|tickets?|game|netflix|spotify|bowling|museum)\b/ },
  { id: 'household', re: /\b(filter|shower|kettle|bulb|bedding|duvet|pillow|cleaning|detergent|toaster|vacuum|lamp|curtains?|towels?|toilet|laundry|repair|replacement|household|plumber|mop|bin)\b/ },
  { id: 'shopping', re: /\b(clothes|shoes|jacket|coat|jeans|hoodie|shirt|dress|trainers|headphones|phone case|shop|shopping|gift|present|haircut|laptop|charger)\b/ },
];

export function pickCategory(t: string, ctx: ParseContext): string {
  const has = (id: string) => ctx.categories.some((c) => c.id === id);
  // match by user-defined category name first
  for (const c of ctx.categories) {
    const n = c.name.toLowerCase();
    if (n.length >= 3 && new RegExp(`\\b${n.replace(/[^a-z0-9 ]/g, '')}\\b`).test(t)) return c.id;
  }
  // strongest signals first: "on <item>" phrase
  const phrase = t.match(/\b(?:on|for)\s+(?:a|an|the|some|my)?\s*(.+?)(?:\s+(?:today|tomorrow|tonight|yesterday|on|by|next|this|for|please)\b|[.?!]|$)/);
  const segments = phrase ? [phrase[1], t] : [t];
  for (const seg of segments) {
    for (const row of CATEGORY_TABLE) {
      if (row.re.test(seg)) {
        if (has(row.id)) return row.id;
        if (row.id === 'books' || row.id === 'entertainment') return has('shopping') ? (row.id === 'books' ? 'books' : 'entertainment') : row.id;
        return row.id;
      }
    }
  }
  return has('shopping') ? 'shopping' : 'other';
}

function pickLabel(t: string): string | undefined {
  const m = t.match(/\b(?:on|for)\s+(?:a|an|the|some|my)?\s*(.+?)(?:\s+(?:today|tomorrow|tonight|yesterday|on|by|next|this|please)\b|[.?!]|$)/);
  if (!m) return undefined;
  const label = m[1].replace(/\s+/g, ' ').trim();
  if (!label || /^(it|that|this|me)$/.test(label)) return undefined;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ---------- intent cues ----------

const HYPO = /\b(can i|could i|should i|may i|would it be ok|is it ok|is it okay|afford|if i|what if|what happens if|am i able|will i be able|i want to (spend|buy|get)|i'?d like to (spend|buy|get)|i plan to|planning to|going to (spend|buy|get)|thinking (of|about)|i'?m about to|how about)\b/;
// D17: "I need to spend £X on Y today" is a committed expense, not a hypothetical.
const COMMITTED = /\b(i need to|i have to|i'?ve got to|i have got to|i got to|i gotta)\s+(spend|pay|buy)\b/;
const PAST_EXPENSE = /\b(spent|spend|paid|pay|bought|purchased|cost me|splurged|blew|picked up|ordered|got (a|an|some|the|my)?)\b/;
const INCOME = /\b(received|recieved|got paid|paid me|earned|gift(ed)?|gave me|given|came in|extra .*\bin\b|bonus|refund|top[- ]?up|transferred|sent me|income|windfall|stipend|wages?|salary)\b/;
const PREFERENCE = /\b(keep|hold|leave|set aside|reserve|put aside|have)\b.*\b(available|free|spare|aside|back|handy|for)\b/;
const COMMITMENT_NOUN = /\b(rent|bills?|utilities|electric(ity)?|gas|water|phone|broadband|wifi|internet|insurance|gym|subscription|netflix|spotify|council tax|tuition|fees?|loan|mortgage)\b/;
const INCREASE = /\b(increases?|increased|goes up|going up|go up|rises?|rising|rose|raised|up by|more expensive|higher|hike[sd]?|going to cost .* more)\b/;
const DECREASE = /\b(decreases?|decreased|goes down|going down|go down|drops?|dropped|reduced?|reduces|down by|cheaper|lower|falls?|cut)\b/;
const SETTO = /\bfrom\s*£?\s*\d[\d,.]*\s*to\b|\b(is now|will be|becomes|changes? to|now costs?|going to be|to be)\b/;

const COMMITMENT_NAMES: [RegExp, string][] = [
  [/\brent\b/, 'rent'],
  [/\b(utilities|electric(ity)?|gas|water|energy)\b/, 'utilities'],
  [/\b(phone)\b/, 'phone'],
  [/\b(broadband|wifi|internet)\b/, 'broadband'],
  [/\b(insurance)\b/, 'insurance'],
  [/\b(gym)\b/, 'gym'],
  [/\b(netflix)\b/, 'netflix'],
  [/\b(spotify)\b/, 'spotify'],
  [/\b(council tax)\b/, 'council tax'],
  [/\b(subscription)\b/, 'subscription'],
  [/\b(bills?)\b/, 'bills'],
];

export function parseDemo(text: string, ctx: ParseContext): ParseResult {
  const raw = (text ?? '').trim();
  if (!raw) return clarify('Tell me what changed, for example "I spent £35 on groceries today".', ['intent']);
  const t = raw.toLowerCase().replace(/[‘’]/g, "'");

  const amt = scanAmount(t);
  if (amt === 'foreign') {
    return clarify('MrMoney works in pounds (GBP) and never converts currency. How much is that in £?', ['currency']);
  }

  // ---- classify
  let kind: Intent['kind'] | null = null;
  const hypoCue = HYPO.test(t) || /\?\s*$/.test(t);
  if (/\b(save|saving|savings)\b/.test(t) && !/\b(can i|afford)\b/.test(t) && /\b(another|extra|more|additional|goal|want|aim|put away|set)\b/.test(t) && !/\bspent\b/.test(t)) kind = 'goal';
  else if (COMMITMENT_NOUN.test(t) && (INCREASE.test(t) || DECREASE.test(t) || SETTO.test(t)) && !/\b(spent|can i)\b/.test(t)) kind = 'commitmentChange';
  else if (/\b(keep|hold|leave|reserve|set aside|put aside)\b/.test(t) && !/\bspent\b/.test(t) && (PREFERENCE.test(t) || /\b(for|on)\b/.test(t)) && !/\b(can i|afford)\b/.test(t)) kind = 'preference';
  else if (INCOME.test(t) && !/\b(spent|paid for|bought|can i|afford)\b/.test(t)) kind = 'income';
  else if (hypoCue && !/\b(spent|bought|paid)\b/.test(t.replace(/\b(if|what if) i (spent|bought|paid)\b/, ''))) kind = 'hypothetical';
  else if (hypoCue) kind = 'hypothetical';
  else if (COMMITTED.test(t)) kind = 'expense';
  else if (PAST_EXPENSE.test(t) && /\b(spent|paid|bought|purchased|cost me|splurged|blew|picked up|ordered|got)\b/.test(t)) kind = 'expense';

  if (!kind) {
    if (amt && amt !== null) {
      return clarify(
        `Did you already spend ${fmt(amt.pence)}, or are you asking whether you can? Say "I spent…" or "Can I spend…".`,
        ['intent'],
      );
    }
    return clarify('I could not tell what changed. Try "I spent £35 on groceries today" or "Can I spend £20 on dinner tomorrow?".', ['intent']);
  }

  if (kind === 'goal' || kind === 'income' || kind === 'expense' || kind === 'hypothetical' || kind === 'preference') {
    if (!amt) {
      const q: Record<string, string> = {
        goal: 'How much more would you like to save?',
        income: 'How much did you receive?',
        expense: 'How much did you spend?',
        hypothetical: 'How much would it cost?',
        preference: 'How much should I keep available?',
      };
      return clarify(q[kind], ['amount']);
    }
  }

  const idemKey = key();
  const done = (intent: Intent, confidence = 0.8): ParseResult => ({ kind: 'intent', intent, confidence, source: 'demo' });

  switch (kind) {
    case 'expense': {
      const a = amt as { pence: number };
      const d = scanDate(t, ctx.today, 'past').date ?? ctx.today;
      const category = pickCategory(t, ctx);
      return done({ kind: 'expense', amount: gbp(a.pence), date: d, category, note: pickLabel(t), idempotencyKey: idemKey }, 0.85);
    }
    case 'income': {
      const a = amt as { pence: number };
      const d = scanDate(t, ctx.today, 'past').date ?? ctx.today;
      return done({ kind: 'income', amount: gbp(a.pence), date: d, note: pickIncomeNote(t), idempotencyKey: idemKey }, 0.85);
    }
    case 'hypothetical': {
      const a = amt as { pence: number };
      const ds = scanDate(t, ctx.today, 'future');
      if (!ds.date) return clarify('Which day is this for?', ['date']);
      return done({
        kind: 'hypothetical', amount: gbp(a.pence), date: ds.date,
        category: pickCategory(t, ctx), label: pickLabel(t), idempotencyKey: idemKey,
      }, 0.85);
    }
    case 'preference': {
      const a = amt as { pence: number };
      const ds = scanDate(t, ctx.today, 'future');
      if (!ds.date) return clarify('Which day should I keep that available for?', ['date']);
      return done({ kind: 'preference', amount: gbp(a.pence), date: ds.date, label: pickPrefLabel(t), idempotencyKey: idemKey }, 0.85);
    }
    case 'goal': {
      const a = amt as { pence: number };
      const ds = scanDate(t, ctx.today, 'future');
      return done({ kind: 'goal', amount: gbp(a.pence), ...(ds.date ? { byDate: ds.date } : {}), idempotencyKey: idemKey }, 0.8);
    }
    case 'commitmentChange': {
      const target = COMMITMENT_NAMES.find(([re]) => re.test(t))?.[1];
      if (!target) return clarify('Which bill is changing?', ['target']);
      if (!amt) return clarify('By how much is it changing?', ['amount']);
      const ds = scanDate(t, ctx.today, 'future');
      let eff = ds.date;
      if (eff && ds.note === 'month') eff = firstOfNextMonth(ctx.today);
      if (!eff) return clarify('From which date does the change apply?', ['date']);
      const both = (amt as { all: number[] }).all;
      const isDelta = /\bby\b/.test(t) || ((INCREASE.test(t) || DECREASE.test(t)) && !/\bto\s*£?\s*\d/.test(t));
      if (isDelta || both.length === 1 && !SETTO.test(t) && !/\bto\s*£?\s*\d/.test(t)) {
        const neg = DECREASE.test(t) && !INCREASE.test(t);
        return done({
          kind: 'commitmentChange', idempotencyKey: idemKey,
          change: { op: 'adjust', target, delta: gbp(neg ? -(amt as { pence: number }).pence : (amt as { pence: number }).pence), effectiveFrom: eff },
        }, 0.8);
      }
      const final = both[both.length - 1];
      return done({
        kind: 'commitmentChange', idempotencyKey: idemKey,
        change: { op: 'set', target, amount: gbp(final), effectiveFrom: eff },
      }, 0.75);
    }
    default:
      return clarify('I could not tell what changed.', ['intent']);
  }
}

function pickIncomeNote(t: string): string | undefined {
  const m = t.match(/\bfrom\s+(?:my\s+|the\s+)?([a-z ]+?)(?:\s+(?:today|tomorrow|yesterday|on)\b|[.?!]|$)/);
  if (m) return `From ${m[1].trim()}`;
  if (/\b(bonus)\b/.test(t)) return 'Bonus';
  if (/\b(refund)\b/.test(t)) return 'Refund';
  if (/\b(gift|gave me|given)\b/.test(t)) return 'Gift';
  return 'Extra income';
}

function pickPrefLabel(t: string): string | undefined {
  const m = t.match(/\b(?:for|on)\s+(?:a|an|the|my)?\s*(?!today|tomorrow)(?!(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)([a-z ]+?)(?:\s+(?:on|by|this|next)\b|[.?!]|$)/);
  if (m) {
    const l = m[1].trim();
    if (l && !/^(today|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday)$/.test(l)) return l.charAt(0).toUpperCase() + l.slice(1);
  }
  return undefined;
}

function fmt(pence: number) {
  const v = pence / 100;
  return `£${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

export class DemoParser implements IntentParser {
  async parse(text: string, ctx: ParseContext): Promise<ParseResult> {
    try {
      return parseDemo(text, ctx);
    } catch {
      return { kind: 'error', message: 'Could not read that. Try rephrasing.' };
    }
  }
}
