/** Clarifying questions for the creative spending plan; answers re-run the schedule locally. */
import { formatMoney } from '@/lib/engine';
import type { Answers, Catalog, Question, ScheduleResult } from './types';

const MAX_QUESTIONS = 12;

export function buildQuestions(catalog: Catalog, result: ScheduleResult, answers: Answers): Question[] {
  const owned: Question[] = [];
  const recipes: Question[] = [];
  const wants: Question[] = [];

  // "Do you already have X?" for staples and equipment the plan pays for.
  const spendByProduct = new Map<string, number>();
  for (const p of result.purchases) {
    if (!p.id.endsWith('-groceries')) continue;
    for (const l of p.lines ?? []) {
      const prod = catalog.products[l.ref.id];
      if (!prod || (prod.kind !== 'staple' && prod.kind !== 'equipment')) continue;
      if (answers.owned[prod.id] !== undefined || l.pence <= 0) continue;
      spendByProduct.set(prod.id, (spendByProduct.get(prod.id) ?? 0) + l.pence);
    }
  }
  for (const [id, saving] of spendByProduct) {
    const prod = catalog.products[id];
    const what = prod.kind === 'equipment' ? `a ${prod.name}` : prod.name;
    owned.push({ id: `owned-${id}`, kind: 'owned', text: `Do you already have ${what}?`, target: id, savingPence: saving });
  }

  // "Do you like X?" for each distinct scheduled recipe not yet rated.
  const rated = new Set([...answers.liked, ...answers.disliked]);
  const seen = new Set<string>();
  const nameToRecipe = new Map(catalog.recipes.map((r) => [r.name, r]));
  for (const p of result.purchases) {
    if (!p.id.endsWith('-groceries')) continue;
    for (const part of p.label.split(' · ')) {
      const name = part.replace(/^[^:]+:\s*/, '');
      const r = nameToRecipe.get(name);
      if (!r || rated.has(r.id) || seen.has(r.id)) continue;
      seen.add(r.id);
      recipes.push({ id: `like-${r.id}`, kind: 'likeRecipe', text: `Do you like ${r.name}?`, target: r.id });
    }
  }

  // "Keep X in the plan?" for each placed want.
  for (const want of catalog.wants) {
    if (answers.droppedWants.includes(want.id)) continue;
    const placed = result.purchases.find((p) => p.id.endsWith(`-want-${want.id}`));
    if (!placed) continue;
    wants.push({
      id: `want-${want.id}`,
      kind: 'keepWant',
      text: `Keep ${want.label} (${formatMoney(placed.amount.pence)}) in the plan?`,
      target: want.id,
      savingPence: placed.amount.pence,
    });
  }

  // Keep room for a few recipe questions: at most 8 "do you have" questions (the biggest savings).
  owned.sort((a, b) => (b.savingPence ?? 0) - (a.savingPence ?? 0));
  const all = [...owned.slice(0, 8), ...wants, ...recipes];
  // Stable sort by saving (unknown = 0), biggest first.
  return all
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (b.q.savingPence ?? 0) - (a.q.savingPence ?? 0) || a.i - b.i)
    .slice(0, MAX_QUESTIONS)
    .map((x) => x.q);
}
