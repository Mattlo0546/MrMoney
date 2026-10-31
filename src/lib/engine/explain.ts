/**
 * Plain-English explanation built ONLY from numbers in the ChangeSet (invariant I11).
 */
import { formatShortDate } from './dates';
import { formatMoney } from './money';
import type { CategoryMove, ChangeSet, Explanation, ExplanationFact, Money } from './types';

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function movesPhrase(moves: CategoryMove[], verb: 'decreased' | 'increased' | 'went down' | 'went up', where = ''): string {
  if (!moves.length) return '';
  const [first, ...rest] = moves;
  const parts = [`${cap(lc(first.categoryName))} ${verb} by ${formatMoney(first.amount)}`];
  for (const m of rest) parts.push(`${lc(m.categoryName)} by ${formatMoney(m.amount)}`);
  return `${list(parts)}${where}.`;
}

function daySpan(moves: CategoryMove[]): string {
  const days = [...new Set(moves.flatMap((m) => m.days))].sort();
  if (!days.length) return '';
  return days.length === 1 ? ` on ${formatShortDate(days[0])}` : ` across ${formatShortDate(days[0])} – ${formatShortDate(days[days.length - 1])}`;
}

function protectedPhrase(d: ChangeSet): string {
  const p = d.protectedAfter;
  const names = [...new Set(p.commitments.filter((c) => c.total.pence > 0).map((c) => c.name))];
  if (d.protectedUnchanged) {
    const items = [...names.map((n, i) => (i === 0 ? cap(n) : lc(n))), `your ${formatMoney(p.minimumReserve)} emergency reserve`];
    if (p.savingsGoal.pence > 0) items.push(`your ${formatMoney(p.savingsGoal)} savings goal`);
    if (!names.length) items[0] = cap(items[0]);
    return `${list(items)} are unchanged.`;
  }
  const same: string[] = [];
  const b = d.protectedBefore;
  for (const c of p.commitments) {
    const old = b.commitments.find((x) => x.id === c.id);
    if (old && old.total.pence === c.total.pence && c.total.pence > 0) same.push(lc(c.name));
  }
  if (b.minimumReserve.pence === p.minimumReserve.pence) same.push(`your ${formatMoney(p.minimumReserve)} emergency reserve`);
  if (b.savingsGoal.pence === p.savingsGoal.pence && p.savingsGoal.pence > 0) same.push(`your ${formatMoney(p.savingsGoal)} savings goal`);
  if (!same.length) return '';
  return `${cap(list(same))} ${same.length > 1 ? 'are' : 'is'} unchanged.`;
}

export function explain(d: ChangeSet): Explanation {
  const facts: ExplanationFact[] = [];
  const fact = (key: string, label: string, value?: Money, text?: string) => facts.push({ key, label, value, text });
  const parts: string[] = [];
  if (d.noop) {
    fact('noop', 'Already applied', undefined, 'This change was already applied, so nothing changed.');
    return { facts, sentence: 'This change was already applied, so nothing changed.' };
  }
  const t = d.target;
  switch (d.intentKind) {
    case 'expense': {
      fact('amount', 'Expense', d.amount);
      fact('absorbed', 'Covered by that day', d.absorbed);
      fact('overspend', 'Taken from later days', d.overspend);
      parts.push(`Added your ${formatMoney(d.amount!)} expense (${lc(t!.categoryName)}, ${formatShortDate(t!.day)}).`);
      if (d.overspend!.pence === 0) parts.push(`It fits in that day's allowance; no other day changed.`);
      else if (d.absorbed!.pence > 0)
        parts.push(`That day's allowance covered ${formatMoney(d.absorbed!)}; the other ${formatMoney(d.overspend!)} comes from later days.`);
      else parts.push(`All ${formatMoney(d.overspend!)} comes from later days.`);
      break;
    }
    case 'hypothetical': {
      fact('amount', 'Planned purchase', d.amount);
      fact('dayRemainingBefore', 'Day had left', d.dayRemainingBefore);
      fact('dayRemainingAfter', 'Day has left', d.dayRemainingAfter);
      const what = t!.label ? `${t!.label} (${lc(t!.categoryName)})` : lc(t!.categoryName);
      parts.push(`Set aside ${formatMoney(d.amount!)} for ${what} on ${formatShortDate(t!.day)}.`);
      if (d.shortfall) {
        fact('shortfall', 'Shortfall moved in', d.shortfall);
        parts.push(`That day had ${formatMoney(d.dayRemainingBefore!)} left, so ${formatMoney(d.shortfall)} moved in from other days.`);
      } else
        parts.push(`It fits in that day's ${formatMoney(d.dayRemainingBefore!)}; ${formatMoney(d.dayRemainingAfter!)} is left that day.`);
      break;
    }
    case 'income':
      fact('amount', 'Income', d.amount);
      parts.push(`Added ${formatMoney(d.amount!)} of income.`);
      break;
    case 'commitmentChange': {
      const c = d.commitment!;
      fact('before', `${c.name} before`, c.before);
      fact('after', `${c.name} after`, c.after);
      fact('totalDelta', 'Change over the plan', c.totalDelta);
      parts.push(`${cap(c.name)} is ${formatMoney(c.after)} from ${formatShortDate(c.effectiveFrom)} (was ${formatMoney(c.before)}); that changes your bills by ${formatMoney(c.totalDelta)} over the plan.`);
      break;
    }
    case 'preference':
      fact('amount', 'Kept available', d.amount);
      fact('dayRemainingAfter', 'Day has left', d.dayRemainingAfter);
      parts.push(`${formatShortDate(t!.day)} now keeps ${formatMoney(d.dayRemainingAfter!)} available (you asked for ${formatMoney(d.amount!)}).`);
      break;
    case 'goal':
      fact('amount', 'Extra savings', d.amount);
      fact('goalAfter', 'Savings goal', d.savingsGoal!.after);
      parts.push(`Your savings goal rose by ${formatMoney(d.amount!)} to ${formatMoney(d.savingsGoal!.after)}.`);
      break;
    case 'settingsEdit':
      parts.push('Updated your settings and re-planned the days ahead.');
      break;
  }
  for (const m of d.sameDaySources) fact(`sameDayFrom:${m.category}`, `${m.categoryName} that day`, m.amount);
  for (const m of d.sources) fact(`from:${m.category}`, `${m.categoryName} decreased`, m.amount);
  for (const m of d.additions) fact(`to:${m.category}`, `${m.categoryName} increased`, m.amount);
  if (d.intentKind !== 'settingsEdit') {
    const tday = t?.day ? ` on ${formatShortDate(t.day)}` : '';
    // For an expense, the same-day reductions are the "covered by that day" part above.
    if (d.intentKind === 'hypothetical' && d.sameDaySources.length)
      parts.push(`To make room, ${lc(movesPhrase(d.sameDaySources, 'went down', tday))}`);
    const dec = movesPhrase(d.sources, 'decreased', daySpan(d.sources));
    const inc = movesPhrase(d.additions, 'increased', daySpan(d.additions));
    if (dec) parts.push(dec);
    if (inc) parts.push(inc);
  }
  if (d.fundingGapAfter.pence > d.fundingGapBefore.pence) {
    fact('gap', 'Not covered', d.fundingGapAfter);
    parts.push(`Your plan is now ${formatMoney(d.fundingGapAfter)} short; see the deficit details.`);
  }
  const prot = protectedPhrase(d);
  if (prot) parts.push(prot);
  fact('protectedUnchanged', 'Protected items unchanged', undefined, String(d.protectedUnchanged));
  return { facts, sentence: parts.join(' ') };
}
