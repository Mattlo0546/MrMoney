/**
 * Direct replies: after client tools succeed (or research returns), the reply is built from the tool results instead
 * of another model call (saves a whole 5–15s step). Every £ figure comes from the engine (tool results / context),
 * formatted with the engine's formatMoney ("£35", "£19.78"). The model stays in the loop only when a tool failed.
 */
import { formatMoney } from '@/lib/engine';
import type { GeminiContent } from './gemini';
import type { Card, ChatContext, ClientToolName, ResearchResult, ToolResult } from './types';

let seq = 0;
const cid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {});
const str = (x: unknown, max = 400) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const int = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : undefined);

/** Splits engine prose into sentences without breaking "£9.16" or "4.5%". */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z£])/).map((s) => s.trim()).filter(Boolean);
}

const stop = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

/** The first one or two sentences, kept short. */
export function brief(text: string, maxChars = 200): string {
  const ss = sentences(text);
  if (!ss.length) return '';
  const two = ss.slice(0, 2).join(' ');
  return ss.length > 1 && two.length <= maxChars ? two : ss[0];
}

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** The setup_plan args the model sent (found in the replayed model turn), to name the defaults it used. */
export function callArgs(contents: GeminiContent[], id: string, name: string): Obj {
  for (let i = contents.length - 1; i >= 0; i--) {
    if (contents[i].role !== 'model') continue;
    const calls = contents[i].parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    const hit = calls.find((c) => c.id === id) ?? calls.find((c) => c.name === name);
    if (hit) return obj(hit.args);
  }
  return {};
}

function setupReply(r: Obj, args: Obj, demo: boolean): { text: string; cards: Card[] } {
  const s = obj(r.summary);
  const daily = int(s.todayAllowancePence);
  const end = str(s.horizonEnd, 10);
  const deficits = Array.isArray(r.deficits) ? r.deficits.map((d) => str(d, 200)).filter(Boolean) : [];
  if (demo) {
    return { text: `The demo plan is loaded${daily !== undefined ? `, with ${formatMoney(daily)} to spend today` : ''}. Try "I need to spend £35 on a shower filter today".`, cards: [] };
  }
  const lead = daily !== undefined ? `Your plan is ready: ${formatMoney(daily)} to spend today${end ? `, lasting to ${fmtDate(end)}` : ''}.` : 'Your plan is ready.';
  // Name at most two defaults: the safety cushion and food are the ones that move the daily figure most.
  const used: string[] = [];
  const food = int(args.foodWeeklyPence);
  const reserve = int(args.minimumReserve);
  if (food === 3500) used.push(`${formatMoney(3500)} a week for food`);
  if (reserve === 20000) used.push(`a ${formatMoney(20000)} safety cushion`);
  const defaults = used.length ? ` I assumed ${used.join(' and ')}; change anything by telling me.` : ' Change anything by telling me.';
  const warn = deficits.length ? ` Heads up: ${brief(deficits[0], 160)}` : '';
  return {
    text: `${lead}${warn || defaults}`,
    cards: [{ id: cid('clarify'), type: 'clarify', question: 'Optional: got a job or other income, or want a different food budget?', chips: ['Add my job income'] }],
  };
}

const UNDO_HINT = 'Tap Undo if that\'s not right.';
const CONFIRM_HINT = 'Nothing changes until you tap Apply.';

/**
 * Builds the final reply from successful client tool results, or returns null when the model should continue
 * (any failure, or nothing usable to say).
 */
export function replyFromToolResults(results: ToolResult[], ctx: ChatContext, contents: GeminiContent[]): { text: string; cards: Card[] } | null {
  if (!results.length || results.some((r) => !r.ok)) return null;
  const parts: string[] = [];
  const cards: Card[] = [];
  let hint = '';
  for (const tr of results) {
    const r = obj(tr.result);
    const name: ClientToolName = tr.name;
    switch (name) {
      case 'setup_plan':
      case 'start_demo': {
        const out = setupReply(r, callArgs(contents, tr.id, tr.name), name === 'start_demo');
        parts.push(out.text);
        cards.push(...out.cards);
        break;
      }
      case 'record_expense':
      case 'record_income':
      case 'keep_available': {
        const ex = brief(str(r.explanation));
        if (!ex) return null;
        parts.push(ex);
        hint = UNDO_HINT;
        break;
      }
      case 'check_purchase': {
        const fits = r.fits;
        const msg = str(r.message) || str(r.explanation);
        if (!msg) return null;
        if (fits === false) {
          parts.push(`${brief(msg, 260)}`);
          hint = 'Pick an option on the card, or Discard.';
        } else {
          parts.push(brief(msg));
          hint = CONFIRM_HINT;
        }
        break;
      }
      case 'plan_goal': {
        const ex = brief(str(r.explanation), 260);
        parts.push(ex || 'Here\'s your calendar, re-planned around it.');
        hint = CONFIRM_HINT;
        break;
      }
      case 'change_commitment':
      case 'set_goal': {
        const ex = brief(str(r.explanation));
        parts.push(ex || 'Here\'s the preview.');
        hint = CONFIRM_HINT;
        break;
      }
      case 'apply_deal': {
        const ex = brief(str(r.explanation));
        parts.push(ex || 'Applied the student deal to your calendar.');
        hint = r.applied ? UNDO_HINT : CONFIRM_HINT;
        break;
      }
      case 'use_rate_in_projections': {
        const planned = ctx.summary?.plannedSavingsPence;
        parts.push('Tap Confirm on the card to use that rate in your projections.');
        hint = planned && planned > 0
          ? `How much do you have saved now? If you don't say, I'll start from your planned savings of ${formatMoney(planned)}.`
          : 'How much do you have saved now? Tell me and I\'ll project it.';
        break;
      }
      case 'quick_plan':
        // The model writes this one (in character); quickPlanReply is the fallback if it is slow.
        return null;
      case 'undo_last':
        parts.push('Undone. Your plan is back to how it was.');
        break;
      default:
        return null;
    }
  }
  const text = [...parts, hint].filter(Boolean).map(stop).join(' ').trim();
  return text ? { text, cards } : null;
}

/** Reply after research, without a model call: the top cited item plus how to use it. */
export function replyFromResearch(r: ResearchResult): string {
  if (!r.items.length) return 'I couldn\'t get live results just now. Please try again in a minute.';
  if (r.sample) return 'Here are curated London student deals matched to your plan. Check with the provider before acting.';
  const top = r.items[0];
  const what = `${top.provider}${top.product && top.product !== top.provider ? ` ${top.product}` : ''}`;
  const rateTopic = r.topic === 'savings_rates' || r.topic === 'cash_isa_rates';
  const next = rateTopic ? 'Tap "Use this rate in projections" to plan with one.' : 'Tap "Apply to a planned purchase" to use one.';
  return `Top live result: ${what}, ${top.headline} (${top.sourceTitle}). ${next} Check with the provider before acting.`;
}

/** Fallback reply for quick_plan when the model is too slow: same figures, same tone. Every £ is from the tool result. */
export function quickPlanReply(result: unknown): string {
  const n = obj(obj(result).numbers);
  const save = int(n.savingsPerMonthPence);
  const year = int(n.savingsPerYearPence);
  const food = int(n.foodPerMonthPence);
  const md = obj(n.cheapestMealDeal);
  const mdPrice = int(md.pricePence);
  const acct = obj(n.savingsAccount);
  if (save === undefined || year === undefined || food === undefined) return 'Your plan is ready and every meal is on the calendar.';
  if (save <= 0) {
    return [
      `Bad news, chef: this lifestyle costs more than you earn.`,
      `• Food: ${formatMoney(food)} a month`,
      `• You'd be short ${formatMoney(-save)} every month`,
      `• Try "brokie mode" and let the meal deals save you`,
    ].join('\n');
  }
  const lead = n.lifestyle === 'brokie' && mdPrice !== undefined
    ? `Congrats, you're officially a meal deal connoisseur! Two ${str(md.merchant, 40)} meal deals a day (${formatMoney(mdPrice)} each) and you save ${formatMoney(save)} a month.`
    : `Plan locked in! Every meal is on your calendar and you save ${formatMoney(save)} a month.`;
  const lines = [lead, `• Food: ${formatMoney(food)} a month`, `• Saved after a year: ${formatMoney(year)}`];
  const bal = int(acct.yearEndBalancePence);
  if (bal !== undefined) lines.push(`• In ${str(acct.provider, 60)} at ${acct.ratePercent}% AER: ${formatMoney(bal)} after a year`);
  return lines.join('\n');
}
