/**
 * Plain-English explanation built ONLY from numbers in the ChangeSet (invariant I11).
 * Every £ figure is produced through `m(path, value)`, so `mentions` records, in sentence
 * order, which ChangeSet field each figure came from.
 */
import { formatDayRange, formatShortDate } from './dates';
import { formatMoney } from './money';
import type { Borrowing, CategoryMove, ChangeSet, Explanation, ExplanationFact, Money, MoneyMention } from './types';

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

type M = (path: string, v: Money) => string;

function movesPhrase(m: M, base: string, moves: CategoryMove[], verb: 'decreased' | 'increased' | 'went down' | 'went up', where = ''): string {
  if (!moves.length) return '';
  const parts = moves.map((x, i) =>
    i === 0 ? `${cap(lc(x.categoryName))} ${verb} by ${m(`${base}[${i}].amount`, x.amount)}` : `${lc(x.categoryName)} by ${m(`${base}[${i}].amount`, x.amount)}`,
  );
  return `${list(parts)}${where}.`;
}

function daySpan(moves: CategoryMove[]): string {
  const days = [...new Set(moves.flatMap((x) => x.days))].sort();
  if (!days.length) return '';
  return days.length === 1 ? ` on ${formatShortDate(days[0])}` : ` across ${formatShortDate(days[0])} – ${formatShortDate(days[days.length - 1])}`;
}

/** "shopping" or "shopping (£18.03) and eating out (£19.25)" */
function borrowWhat(m: M, b: Borrowing): string {
  if (b.sources.length === 1) return lc(b.sources[0].categoryName);
  return list(b.sources.map((x, i) => `${lc(x.categoryName)} (${m(`borrowed.sources[${i}].amount`, x.amount)})`));
}

function protectedPhrase(m: M, d: ChangeSet): string {
  const p = d.protectedAfter, b = d.protectedBefore;
  const same: string[] = [];
  const notes: string[] = [];
  for (const c of p.commitments) {
    const old = b.commitments.find((x) => x.id === c.id);
    if (old && old.total.pence === c.total.pence && c.total.pence > 0 && !same.includes(lc(c.name))) same.push(lc(c.name));
  }
  const reserve = () => `your ${m('protectedAfter.minimumReserve', p.minimumReserve)} emergency reserve`;
  if (b.minimumReserve.pence === p.minimumReserve.pence) {
    const shortA = p.reserveShortfall?.pence ?? 0, shortB = b.reserveShortfall?.pence ?? 0;
    if (shortA === 0 && shortB === 0) same.push(reserve());
    else if (shortA > 0 && shortA !== shortB)
      notes.push(`${cap(reserve())} would run ${m('protectedAfter.reserveShortfall', p.reserveShortfall!)} short at its lowest point.`);
    else if (shortA > 0) notes.push(`${cap(reserve())} is still ${m('protectedAfter.reserveShortfall', p.reserveShortfall!)} short at its lowest point.`);
    else notes.push(`${cap(reserve())} is fully covered again.`);
  }
  const goal = p.savingsGoal.pence;
  if (goal > 0 && b.savingsGoal.pence === goal) {
    const savA = p.plannedSavings?.pence ?? goal, savB = b.plannedSavings?.pence ?? goal;
    const g = () => `your ${m('protectedAfter.savingsGoal', p.savingsGoal)} savings goal`;
    if (savA === goal && savB === goal) same.push(g());
    else if (savA === goal) notes.push(`${cap(g())} is fully funded again.`);
    else if (savA === 0) notes.push(`${cap(g())} can no longer be funded.`);
    else notes.push(`Only ${m('protectedAfter.plannedSavings', p.plannedSavings!)} of ${g()} is funded now.`);
  }
  const out: string[] = [];
  if (same.length) out.push(`${cap(list(same))} ${same.length > 1 ? 'are' : 'is'} unchanged.`);
  return [...out, ...notes].join(' ');
}

const TOKEN = /\u0000(\d+)\u0000/g;

export function explain(d: ChangeSet): Explanation {
  const facts: ExplanationFact[] = [];
  const fact = (key: string, label: string, value?: Money, text?: string) => facts.push({ key, label, value, text });
  const slots: MoneyMention[] = [];
  const m: M = (path, v) => {
    slots.push({ text: formatMoney(v), path });
    return `\u0000${slots.length - 1}\u0000`;
  };
  const parts: string[] = [];
  if (d.noop) {
    fact('noop', 'Already applied', undefined, 'This change was already applied, so nothing changed.');
    return { facts, sentence: 'This change was already applied, so nothing changed.', mentions: [] };
  }
  const t = d.target;
  switch (d.intentKind) {
    case 'expense': {
      const overspend = d.overspend?.pence ?? 0;
      const later = d.takenFromLater ?? d.overspend;
      const uncovered = d.uncovered?.pence ?? 0;
      fact('amount', 'Expense', d.amount);
      fact('absorbed', 'Covered by that day', d.absorbed);
      fact('overspend', 'Over that day', d.overspend);
      fact('takenFromLater', 'Taken from later days', later);
      if (d.fromUnallocated) fact('fromUnallocated', 'From unassigned money', d.fromUnallocated);
      if (uncovered) fact('uncovered', "Couldn't be covered", d.uncovered);
      parts.push(`Added your ${m('amount', d.amount!)} expense (${lc(t!.categoryName)}, ${formatShortDate(t!.day)}).`);
      if (overspend === 0) {
        parts.push(`It fits in that day's allowance; no other day changed.`);
        break;
      }
      const absorbed = d.absorbed!.pence > 0;
      const pieces: string[] = [];
      const laterPence = later?.pence ?? 0;
      const simple = uncovered === 0 && !d.fromUnallocated;
      if (simple) {
        parts.push(absorbed
          ? `That day's allowance covered ${m('absorbed', d.absorbed!)}; the other ${m(d.takenFromLater ? 'takenFromLater' : 'overspend', later!)} comes from later days.`
          : `All ${m(d.takenFromLater ? 'takenFromLater' : 'overspend', later!)} comes from later days.`);
        break;
      }
      if (absorbed) pieces.push(d.itemised ? `The planned purchase covered ${m('absorbed', d.absorbed!)}` : `That day's allowance covered ${m('absorbed', d.absorbed!)}`);
      if (laterPence > 0) pieces.push(`${m('takenFromLater', later!)} comes from later days`);
      if (d.fromUnallocated)
        pieces.push(d.itemised
          ? `${m('fromUnallocated', d.fromUnallocated)} comes out of your buffer${d.bufferAfter ? ` (${m('bufferAfter', d.bufferAfter)} left)` : ''}`
          : `${m('fromUnallocated', d.fromUnallocated)} comes from money not assigned to any day`);
      if (uncovered > 0) pieces.push(`${m('uncovered', d.uncovered!)} couldn't be covered`);
      parts.push(`${cap(pieces.join('; '))}.`);
      break;
    }
    case 'hypothetical': {
      fact('amount', 'Planned purchase', d.amount);
      fact('dayRemainingBefore', 'Day had left', d.dayRemainingBefore);
      fact('dayRemainingAfter', 'Day has left', d.dayRemainingAfter);
      const what = t!.label ? `${t!.label} (${lc(t!.categoryName)})` : lc(t!.categoryName);
      if (d.itemised) {
        parts.push(`Set aside ${m('amount', d.amount!)} for ${what} on ${formatShortDate(t!.day)}.`);
        if (d.bufferAfter) parts.push(`It comes out of your buffer; ${m('bufferAfter', d.bufferAfter)} isn't tied to a purchase now.`);
        break;
      }
      const b = d.borrowed;
      const avail = d.dayAvailableBefore ? m('dayAvailableBefore', d.dayAvailableBefore) : null;
      if (b) fact('borrowed', 'Borrowed from the following days', b.amount);
      if (b && !d.tradeoff)
        parts.push(`Fits — ${m('borrowed.amount', b.amount)} comes from ${borrowWhat(m, b)} over ${formatDayRange(b.from, b.to)}.`);
      parts.push(`Set aside ${m('amount', d.amount!)} for ${what} on ${formatShortDate(t!.day)}.`);
      if (d.tradeoff) {
        fact('shortfall', 'Covered by your trade-off', d.tradeoff.amount);
        const borrowedPart = b ? `, ${m('borrowed.amount', b.amount)} is borrowed from ${borrowWhat(m, b)} over ${formatDayRange(b.from, b.to)},` : '';
        parts.push(`That day had ${avail ?? m('dayRemainingBefore', d.dayRemainingBefore!)} to spare${borrowedPart} and the other ${m('tradeoff.amount', d.tradeoff.amount)} comes from your chosen trade-off (${lc(d.tradeoff.title)}).`);
      } else if (d.shortfall) {
        // Diffs from older engine versions.
        fact('shortfall', 'Shortfall moved in', d.shortfall);
        parts.push(`That day had ${m('dayRemainingBefore', d.dayRemainingBefore!)} left, so ${m('shortfall', d.shortfall)} moved in from other days.`);
      } else if (!b)
        parts.push(`It fits in the ${avail ?? m('dayRemainingBefore', d.dayRemainingBefore!)} that day had to spare; ${m('dayRemainingAfter', d.dayRemainingAfter!)} is left that day.`);
      break;
    }
    case 'income':
      fact('amount', 'Income', d.amount);
      parts.push(`Added ${m('amount', d.amount!)} of income.`);
      break;
    case 'commitmentChange': {
      const c = d.commitment!;
      fact('before', `${c.name} before`, c.before);
      fact('after', `${c.name} after`, c.after);
      fact('totalDelta', 'Change over the plan', c.totalDelta);
      parts.push(`${cap(c.name)} is ${m('commitment.after', c.after)} from ${formatShortDate(c.effectiveFrom)} (was ${m('commitment.before', c.before)}); that changes your bills by ${m('commitment.totalDelta', c.totalDelta)} over the plan.`);
      break;
    }
    case 'preference':
      fact('amount', 'Kept available', d.amount);
      fact('dayRemainingAfter', 'Day has left', d.dayRemainingAfter);
      parts.push(`${formatShortDate(t!.day)} now keeps ${m('dayRemainingAfter', d.dayRemainingAfter!)} available (you asked for ${m('amount', d.amount!)}).`);
      break;
    case 'goal':
      fact('amount', 'Extra savings', d.amount);
      fact('goalAfter', 'Savings goal', d.savingsGoal!.after);
      parts.push(`Your savings goal rose by ${m('amount', d.amount!)} to ${m('savingsGoal.after', d.savingsGoal!.after)}${d.savingsGoal!.byDate ? `, set aside by ${formatShortDate(d.savingsGoal!.byDate)}` : ''}.`);
      break;
    case 'removePlannedPurchase':
      fact('amount', 'Planned purchase removed', d.amount);
      parts.push(d.itemised && d.bufferAfter
        ? `Removed the ${m('amount', d.amount!)} planned purchase (${t!.label ?? lc(t!.categoryName)}, ${formatShortDate(t!.day)}); that money goes back to your buffer, now ${m('bufferAfter', d.bufferAfter)}.`
        : `Removed the ${m('amount', d.amount!)} planned purchase (${t!.label ?? lc(t!.categoryName)}, ${formatShortDate(t!.day)}); that money is free to spend on ${formatShortDate(t!.day)} again.`);
      break;
    case 'itinerary': {
      const it = d.itinerary!;
      fact('planned', 'Planned purchases', it.planned, String(it.purchases));
      if (d.bufferAfter) fact('buffer', 'Buffer', d.bufferAfter);
      const n = `${it.purchases} purchase${it.purchases === 1 ? '' : 's'}`;
      parts.push(`Applied your spending plan: ${n}, ${m('itinerary.planned', it.planned)} planned${d.bufferAfter ? `, ${m('bufferAfter', d.bufferAfter)} buffer` : ''}.`);
      if (it.mode === 'itemised') parts.push('Every day now holds only its planned purchases.');
      break;
    }
    case 'settingsEdit':
      parts.push('Updated your settings and re-planned the days ahead.');
      break;
  }
  for (const x of d.sameDaySources) fact(`sameDayFrom:${x.category}`, `${x.categoryName} that day`, x.amount);
  for (const x of d.sources) fact(`from:${x.category}`, `${x.categoryName} decreased`, x.amount);
  for (const x of d.additions) fact(`to:${x.category}`, `${x.categoryName} increased`, x.amount);
  if (d.intentKind !== 'settingsEdit' && d.intentKind !== 'itinerary') {
    const tday = t?.day ? ` on ${formatShortDate(t.day)}` : '';
    // For an expense, the same-day reductions are the "covered by that day" part above.
    if (d.intentKind === 'hypothetical' && d.sameDaySources.length)
      parts.push(`To make room, ${lc(movesPhrase(m, 'sameDaySources', d.sameDaySources, 'went down', tday))}`);
    // A purchase that only borrowed has already said where the money came from.
    const borrowOnly = d.intentKind === 'hypothetical' && d.borrowed && !d.tradeoff;
    if (!borrowOnly && d.sources.length) parts.push(movesPhrase(m, 'sources', d.sources, 'decreased', daySpan(d.sources)));
    if (d.additions.length) parts.push(movesPhrase(m, 'additions', d.additions, 'increased', daySpan(d.additions)));
  }
  if (d.fundingGapAfter.pence > d.fundingGapBefore.pence) {
    fact('gap', 'Not covered', d.fundingGapAfter);
    parts.push(`Your plan is now ${m('fundingGapAfter', d.fundingGapAfter)} short; see the deficit details.`);
  }
  const prot = protectedPhrase(m, d);
  if (prot) parts.push(prot);
  fact('protectedUnchanged', 'Protected items unchanged', undefined, String(d.protectedUnchanged));
  const raw = parts.join(' ');
  const mentions: MoneyMention[] = [];
  const sentence = raw.replace(TOKEN, (_, i: string) => {
    const s = slots[Number(i)];
    mentions.push(s);
    return s.text;
  });
  return { facts, sentence, mentions };
}
