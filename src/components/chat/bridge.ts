'use client';
/**
 * Bridge between the chat agent and the deterministic engine (chat-contract.md, client tools table).
 * Every number here comes from the engine via the store; this module only maps tool args to intents,
 * validates them (zod, the shared schemas) and summarises engine output for the model.
 */
import { applyIntent, explain, formatMoney, gbp, previewIntent } from '@/lib/engine';
import type { ChangeSet, EngineState, Intent, ISODate, Summary } from '@/lib/engine';
import { getAppStore, londonToday } from '@/lib/store';
import type { AppSnapshot } from '@/lib/store';
import {
  CLIENT_TOOL_SCHEMAS, type ChatContext, type ChatSummary, type ClientToolCall, type PlanDigest, type ToolResult,
} from '@/lib/agent/types';
import { buildPayload, defaultForm, uid, type Form } from '@/components/onboarding/model';
import { buildPlanData } from '@/components/plan/calendar/data';
import type { PreviewData } from '@/components/plan/change/changeState';
import { newId, type UiCard } from './model';
import { readProjectionRates, writeProjectionRate } from './projections';

// ------------------------------------------------------------------ context

export function summaryOf(state: EngineState | null): ChatSummary | undefined {
  const p = state?.plan;
  if (!state || !p) return undefined;
  const s = p.summary;
  return {
    balancePence: s.balance.pence,
    todayAllowancePence: s.todayAllowance.pence,
    todayRemainingPence: s.todayRemaining.pence,
    todaySpentPence: s.todaySpent.pence,
    flexibleRemainingPence: s.flexibleRemaining.pence,
    reservedForCommitmentsPence: s.reservedForCommitments.pence,
    reservePence: s.reserve.pence,
    plannedSavingsPence: s.plannedSavings.pence,
    futureIncomePence: s.futureIncome.pence,
    unallocatedPence: p.unallocated.pence,
    fundingGapPence: p.fundingGap.pence,
    planStart: state.profile.planStart,
    horizonEnd: state.profile.horizonEnd,
  };
}

function readCity(): string | undefined {
  try {
    const raw = window.localStorage.getItem('studentplan.onboardingExtras');
    const city = raw ? (JSON.parse(raw) as { city?: unknown }).city : undefined;
    return typeof city === 'string' && city.trim() ? city.trim().slice(0, 60) : undefined;
  } catch {
    return undefined;
  }
}

function digestOf(state: EngineState, today: ISODate, demo: boolean): PlanDigest {
  const data = buildPlanData(state, today);
  const bills: NonNullable<PlanDigest['bills']> = [];
  const next14: NonNullable<PlanDigest['next14']> = [];
  const days = [...data.days.values()].filter((d) => d.date >= today && d.inPlan).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    for (const f of d.fixed) if (bills.length < 20) bills.push({ name: f.name.slice(0, 60), amountPence: f.pence, date: d.date });
    if (next14.length < 14) {
      const spent = d.entries.filter((e) => e.kind === 'expense').reduce((t, e) => t + e.pence, 0);
      next14.push({ date: d.date, plannedPence: d.total, ...(spent ? { spentPence: spent } : {}) });
    }
  }
  const rates = readProjectionRates();
  return {
    bills,
    next14,
    incomes: state.incomes.slice(0, 20).map((i) => ({ label: (i.note ?? (i.source === 'job' ? 'Job pay' : 'Income')).slice(0, 60), amountPence: i.amount.pence, date: i.date, confirmed: i.confirmed })),
    deficits: (state.plan?.deficits ?? []).slice(0, 10).map((d) => ({ kind: d.kind, amountPence: d.amount.pence, reason: d.reason.slice(0, 200) })),
    plannedPurchases: state.plannedPurchases.slice(0, 20).map((p) => ({ label: p.label.slice(0, 60), amountPence: p.amount.pence, date: p.date, category: p.category.slice(0, 40) })),
    ...(rates.savings !== undefined || rates.investments !== undefined ? { projectionRates: rates } : {}),
    ...(readCity() ? { city: readCity() } : demo ? { city: 'London' } : {}),
  };
}

export function buildContext(snap: AppSnapshot): ChatContext {
  const state = snap.state;
  const today = snap.hydrated && snap.today !== '1970-01-01' ? snap.today : londonToday();
  if (!state) return { today, demoMode: snap.demoActive, hasPlan: false };
  let planDigest: PlanDigest | undefined;
  try {
    planDigest = digestOf(state, today, snap.demoActive);
  } catch {
    planDigest = undefined;
  }
  return {
    today,
    demoMode: snap.demoActive,
    hasPlan: true,
    summary: summaryOf(state),
    ...(planDigest ? { planDigest } : {}),
    categories: state.profile.categories.slice(0, 30).map((c) => ({ id: c.id.slice(0, 40), name: c.name.slice(0, 60) })),
  };
}

// ------------------------------------------------------------------ helpers

const key = (tool: string) => `chat-${tool}-${newId('k')}`;

/** Category label from the model -> a plan category id when it names one (else the label, which the engine accepts for expenses). */
function categoryId(state: EngineState, raw: string): string {
  const t = raw.trim().toLowerCase();
  const cats = state.profile.categories;
  const hit = cats.find((c) => c.id === t || c.name.toLowerCase() === t)
    ?? cats.find((c) => c.name.toLowerCase().includes(t) || t.includes(c.name.toLowerCase()))
    ?? (/(food|grocer|supermarket)/.test(t) ? cats.find((c) => c.id === 'groceries') : undefined)
    ?? (/(dinner|lunch|restaurant|takeaway|meal|eat)/.test(t) ? cats.find((c) => c.id === 'eating-out') : undefined)
    ?? (/(bus|train|travel|uber|taxi|tube)/.test(t) ? cats.find((c) => c.id === 'transport') : undefined)
    ?? (/(party|cinema|drinks|night out|fun|social)/.test(t) ? cats.find((c) => c.id === 'social') : undefined);
  return hit ? hit.id : t.replace(/\s+/g, '-').slice(0, 40) || 'other';
}

/** Hypotheticals must use a plan category (the engine allocates by category). */
function planCategoryId(state: EngineState, raw: string): string {
  const id = categoryId(state, raw);
  if (state.profile.categories.some((c) => c.id === id)) return id;
  const fallback = state.profile.categories.find((c) => !c.essential) ?? state.profile.categories[0];
  return fallback?.id ?? id;
}

function shortSummary(s: Summary | undefined) {
  if (!s) return undefined;
  return {
    todayRemainingPence: s.todayRemaining.pence,
    todayAllowancePence: s.todayAllowance.pence,
    flexibleRemainingPence: s.flexibleRemaining.pence,
    balancePence: s.balance.pence,
    plannedSavingsPence: s.plannedSavings.pence,
  };
}

const fail = (call: ClientToolCall, error: string, cards: UiCard[] = []): Exec => ({
  result: { id: call.id, name: call.name, ok: false, error: error.slice(0, 1000) },
  cards,
});

export interface Exec {
  result: ToolResult;
  cards: UiCard[];
}

function appliedCard(intent: Intent, diff: ChangeSet | null, changeId: number, noop: boolean): UiCard {
  return {
    type: 'change_applied', id: newId('c'), intent, diff, changeId, noop,
    explanation: diff ? explain(diff) : { facts: [], sentence: 'That was already in your plan, so nothing changed.' },
  };
}

/** Commit an intent now (expenses, income, keep-available, undo-able). */
function commitNow(call: ClientToolCall, intent: Intent): Exec {
  const store = getAppStore();
  const out = store.apply(intent, intent.idempotencyKey);
  if (!out.ok) {
    const msg = out.needsClarification?.question ?? out.error?.message ?? 'The plan could not take that change.';
    return fail(call, msg);
  }
  const diff = out.diff ?? null;
  const card = appliedCard(intent, diff, out.changeId, out.noop || !diff);
  return {
    result: {
      id: call.id, name: call.name, ok: true,
      result: {
        applied: true,
        changeId: String(out.changeId),
        explanation: card.type === 'change_applied' ? card.explanation.sentence : '',
        summary: shortSummary(store.getSnapshot().state?.plan?.summary),
        undoAvailable: true,
      },
    },
    cards: [card],
  };
}

function previewCard(call: ClientToolCall, intent: Intent, title: string, replaceFirst?: Intent, previewState?: EngineState): Exec {
  const store = getAppStore();
  let pv: PreviewData | null;
  if (previewState) {
    // apply_deal: preview the re-planned purchase on top of a state where the old one is removed.
    pv = previewOn(previewState, intent);
  } else {
    pv = store.preview(intent) as PreviewData | null;
  }
  if (!pv) return fail(call, 'There is no plan yet.');
  const aff = pv.affordability;
  if (!pv.ok && !(aff && !aff.fits)) {
    const msg = pv.needsClarification?.question ?? pv.error?.message ?? 'That change cannot be previewed.';
    return fail(call, msg);
  }
  const card: UiCard = { type: 'preview', id: newId('p'), tool: call.name, title, intent, pv, chosenOptionId: null, state: 'open', ...(replaceFirst ? { replaceFirst } : {}) };
  const explanation = aff ? (aff.fits ? aff.preview.explanation.sentence : aff.message ?? '') : pv.ok ? explain(pv.diff).sentence : '';
  return {
    result: {
      id: call.id, name: call.name, ok: true,
      result: {
        status: 'preview_shown_awaiting_user',
        note: 'Nothing is committed. The user taps Apply or Discard on the card.',
        previewId: card.id,
        ...(aff
          ? {
              fits: aff.fits,
              ...(aff.fits ? { remainingAfterPence: aff.remainingAfter, borrowedPence: aff.borrowed ?? 0 } : { shortfallPence: aff.shortfall, dayRemainingPence: aff.dayRemaining }),
              message: aff.message,
              options: aff.fits ? [] : aff.options.map((o) => ({ id: o.id, summary: o.title })),
            }
          : {}),
        explanation,
      },
    },
    cards: [card],
  };
}

// Engine preview on an arbitrary state (used by apply_deal's remove-then-replan preview).
function previewOn(state: EngineState, intent: Intent): PreviewData | null {
  const today = getAppStore().getSnapshot().today;
  return { ...previewIntent(state, intent, today), intent, today } as PreviewData;
}

// ------------------------------------------------------------------ setup_plan

function poundsText(pence: number): string {
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

function setupPlan(call: Extract<ClientToolCall, { name: 'setup_plan' }>): Exec {
  const a = call.args;
  const today = londonToday();
  const base = defaultForm(today);
  // Priority order: the model's list first, then the rest in default order.
  const order = [...a.priorities, ...base.flex.map((f) => f.id).filter((id) => !(a.priorities as string[]).includes(id))];
  const flex = order.map((id) => base.flex.find((f) => f.id === id)!).filter(Boolean);
  const form: Form = {
    ...base,
    fundsType: a.fundsType,
    funds: poundsText(a.funds),
    allowanceDay: String(a.allowanceDay ?? 1),
    openingBalance: '0',
    horizonEnd: a.horizonEnd,
    hasJob: false,
    others: a.incomes.map((i) => ({ id: uid('inc'), amount: poundsText(i.amountPence), date: i.date, confirmed: i.confirmed })),
    commits: a.commitments.map((c) => ({
      id: uid('cm'), name: c.name, amount: poundsText(c.amountPence), recurrence: c.recurrence,
      day: String(c.dayOfMonth ?? 1), date: c.date ?? '',
    })),
    reserve: poundsText(a.minimumReserve),
    goal: poundsText(a.savingsGoal),
    food: poundsText(a.foodWeeklyPence),
    transport: poundsText(a.transportWeeklyPence),
    flex,
    city: a.city ?? '',
  };
  const payload = buildPayload(form, today);
  // Keep the model's income labels and job/other source (the form builder only knows "other").
  const incomes = payload.incomes.map((inc, i) => {
    const src = a.incomes[i];
    return { ...inc, note: src?.label ?? inc.note, source: src?.source ?? (/job|shift|wage|pay/i.test(src?.label ?? '') ? 'job' : 'other') } as typeof inc;
  });
  const profile = { ...payload.profile, hasJob: incomes.some((i) => i.source === 'job') };
  const store = getAppStore();
  const res = store.completeOnboarding(profile, { commitments: payload.commitments, incomes });
  if (!res.ok) {
    return fail(call, `The plan could not be built: ${Object.entries(res.errors).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  }
  try {
    window.localStorage.setItem('studentplan.onboardingExtras', JSON.stringify(payload.extras));
  } catch {
    /* storage may be blocked */
  }
  const snap = store.getSnapshot();
  return { result: planResult(call, snap), cards: [planCard(snap)] };
}

function planResult(call: ClientToolCall, snap: AppSnapshot): ToolResult {
  return {
    id: call.id, name: call.name, ok: true,
    result: { created: true, today: snap.today, summary: summaryOf(snap.state), deficits: snap.state?.plan?.deficits.map((d) => d.reason).slice(0, 5) ?? [] },
  };
}

export function planCard(snap: AppSnapshot): UiCard {
  const st = snap.state!;
  const data = (() => {
    try {
      return buildPlanData(st, snap.today);
    } catch {
      return null;
    }
  })();
  const bills: { name: string; pence: number }[] = [];
  if (data) {
    const seen = new Set<string>();
    for (const d of [...data.days.values()].sort((x, y) => x.date.localeCompare(y.date))) {
      if (d.date < snap.today) continue;
      for (const f of d.fixed) if (!seen.has(f.name)) { seen.add(f.name); bills.push({ name: f.name, pence: f.pence }); }
    }
  }
  return {
    type: 'plan_created', id: newId('pc'), summary: st.plan!.summary, horizonEnd: st.profile.horizonEnd, planStart: st.profile.planStart,
    bills: bills.slice(0, 4),
  };
}

// ------------------------------------------------------------------ dispatcher

export function executeCall(raw: ClientToolCall): Exec {
  const schema = CLIENT_TOOL_SCHEMAS[raw.name];
  if (!schema) return fail(raw, `Unknown tool ${String(raw.name)}`);
  const parsed = schema.safeParse(raw.args ?? {});
  if (!parsed.success) {
    return fail(raw, `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}`);
  }
  const call = { ...raw, args: parsed.data } as ClientToolCall;
  const store = getAppStore();
  const snap = store.getSnapshot();

  if (call.name === 'setup_plan') return setupPlan(call);
  if (call.name === 'start_demo') {
    store.startDemo();
    const s = store.getSnapshot();
    return { result: planResult(call, s), cards: [planCard(s)] };
  }
  if (call.name === 'undo_last') {
    const ok = store.undo();
    if (!ok) return fail(call, 'There is nothing to undo.');
    return {
      result: { id: call.id, name: call.name, ok: true, result: { undone: true, summary: shortSummary(store.getSnapshot().state?.plan?.summary) } },
      cards: [{ type: 'notice', id: newId('n'), text: 'Undone. Your plan is back to how it was before that change.' }],
    };
  }

  const state = snap.state;
  if (!state) return fail(call, 'There is no plan yet. Set one up first (setup_plan) or start the demo.');

  switch (call.name) {
    case 'record_expense': {
      const a = call.args;
      return commitNow(call, {
        kind: 'expense', idempotencyKey: key(call.name), amount: gbp(a.amountPence), date: a.date,
        category: categoryId(state, a.category), ...(a.note ? { note: a.note } : {}),
      });
    }
    case 'record_income': {
      const a = call.args;
      if (!a.confirmed) {
        return fail(call, 'Only confirmed income (amount and date known) goes into the plan. Ask the user to confirm it first.');
      }
      return commitNow(call, { kind: 'income', idempotencyKey: key(call.name), amount: gbp(a.amountPence), date: a.date, note: a.label });
    }
    case 'keep_available': {
      const a = call.args;
      return commitNow(call, { kind: 'preference', idempotencyKey: key(call.name), date: a.date, amount: gbp(a.amountPence) });
    }
    case 'check_purchase': {
      const a = call.args;
      const intent: Intent = {
        kind: 'hypothetical', idempotencyKey: key(call.name), amount: gbp(a.amountPence), date: a.date,
        category: planCategoryId(state, a.category), label: a.label,
      };
      return previewCard(call, intent, `Can I spend ${formatMoney(a.amountPence)}?`);
    }
    case 'change_commitment': {
      const a = call.args;
      const t = a.name.trim().toLowerCase();
      const c = state.commitments.find((x) => x.name.toLowerCase() === t) ?? state.commitments.find((x) => x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase()));
      if (!c) return fail(call, `No bill called "${a.name}". Known bills: ${state.commitments.map((x) => x.name).join(', ') || 'none'}.`);
      const intent: Intent = {
        kind: 'commitmentChange', idempotencyKey: key(call.name),
        change: a.newAmountPence !== undefined
          ? { op: 'set', target: c.id, amount: gbp(a.newAmountPence), effectiveFrom: a.effectiveFrom }
          : { op: 'adjust', target: c.id, delta: gbp(a.deltaPence!), effectiveFrom: a.effectiveFrom },
      };
      return previewCard(call, intent, `Change ${c.name}`);
    }
    case 'set_goal': {
      const a = call.args;
      const intent: Intent = { kind: 'goal', idempotencyKey: key(call.name), amount: gbp(a.extraSavingsPence), ...(a.byDate ? { byDate: a.byDate } : {}) };
      return previewCard(call, intent, `Save ${formatMoney(a.extraSavingsPence)} more`);
    }
    case 'apply_deal': {
      const a = call.args;
      const label = a.plannedPurchaseLabel?.trim().toLowerCase();
      const cat = a.category ? categoryId(state, a.category) : undefined;
      const pp = state.plannedPurchases.filter((p) => p.date >= snap.today).find((p) =>
        (label && (p.label.toLowerCase().includes(label) || label.includes(p.label.toLowerCase()))) || (!label && cat && p.category === cat));
      if (!pp) {
        return fail(call, 'No upcoming planned purchase matches. A deal can lower a planned purchase: ask the user to plan it first with check_purchase, then apply the deal.');
      }
      // percentOff is turned into a new amount here (rounded to the penny); the engine re-plans everything else.
      const newPence = a.newAmountPence ?? Math.round(pp.amount.pence * (1 - (a.percentOff ?? 0) / 100));
      if (newPence >= pp.amount.pence) return fail(call, 'That deal would not lower the planned amount.');
      const remove: Intent = { kind: 'removePlannedPurchase', idempotencyKey: key('remove'), plannedPurchaseId: pp.id };
      const removed = applyIntent(state, remove, snap.today);
      if (!removed.ok) return fail(call, 'Could not update that planned purchase.');
      const replan: Intent = {
        kind: 'hypothetical', idempotencyKey: key(call.name), amount: gbp(newPence), date: pp.date, category: pp.category,
        label: `${pp.label} (deal)`,
      };
      return previewCard(call, replan, `${pp.label}: ${formatMoney(pp.amount)} → ${formatMoney(newPence)} with the deal`, remove, removed.nextState);
    }
    case 'use_rate_in_projections': {
      const a = call.args;
      const card: UiCard = {
        type: 'confirm', id: newId('cf'), tool: 'use_rate_in_projections', bucket: a.bucket, ratePercent: a.ratePercent, sourceRef: a.sourceRef,
        title: `Use ${a.ratePercent}% for ${a.bucket} in projections`,
        lines: [`Base ${a.bucket === 'savings' ? 'savings rate' : 'investment return'}: ${a.ratePercent}% a year`, 'Projections are estimates, not advice or a guarantee.'],
        state: 'open',
      };
      return {
        result: { id: call.id, name: call.name, ok: true, result: { status: 'confirm_shown_awaiting_user', previewId: card.id } },
        cards: [card],
      };
    }
    default:
      return fail(call, 'Unsupported tool.');
  }
}

// ------------------------------------------------------------------ card actions (user taps)

export type ActionOutcome = { ok: true; card: UiCard; followUp?: UiCard; text: string } | { ok: false; message: string };

export function applyPreview(card: Extract<UiCard, { type: 'preview' }>): ActionOutcome {
  if (card.state !== 'open' || !card.pv) return { ok: false, message: 'This preview has expired. Ask me again.' };
  const store = getAppStore();
  const aff = card.pv.affordability;
  const needsOption = !!aff && !aff.fits;
  if (needsOption && !card.chosenOptionId) return { ok: false, message: 'Pick an option first.' };
  const intent: Intent = card.intent.kind === 'hypothetical' && needsOption ? { ...card.intent, tradeoffOptionId: card.chosenOptionId ?? undefined } : card.intent;
  if (card.replaceFirst) {
    const r = store.apply(card.replaceFirst, card.replaceFirst.idempotencyKey);
    if (!r.ok) return { ok: false, message: r.error?.message ?? 'Could not update that planned purchase.' };
  }
  const out = store.apply(intent, intent.idempotencyKey);
  if (!out.ok) {
    return { ok: false, message: out.needsClarification?.question ?? out.error?.message ?? 'The plan could not take that change.' };
  }
  const applied = appliedCard(intent, out.diff ?? null, out.changeId, out.noop || !out.diff);
  return { ok: true, card: { ...card, state: 'applied', pv: null }, followUp: applied, text: 'Done. Here is what changed.' };
}

export function confirmRate(card: Extract<UiCard, { type: 'confirm' }>): ActionOutcome {
  if (card.state !== 'open') return { ok: false, message: 'Already handled.' };
  const snap = getAppStore().getSnapshot();
  const ok = writeProjectionRate(card.bucket, card.ratePercent, snap.state?.plan?.summary.plannedSavings.pence ?? 0);
  if (!ok) return { ok: false, message: 'Could not save that (storage is blocked).' };
  return {
    ok: true,
    card: { ...card, state: 'applied', result: 'Saved to projections.' },
    text: `Projections now use ${card.ratePercent}% as the base ${card.bucket === 'savings' ? 'savings rate' : 'investment return'}.`,
  };
}

export function undoChange(card: Extract<UiCard, { type: 'change_applied' }>): ActionOutcome {
  const store = getAppStore();
  const snap = store.getSnapshot();
  if (snap.changeId !== card.changeId || !snap.canUndo) return { ok: false, message: 'Only the latest change can be undone.' };
  if (!store.undo()) return { ok: false, message: 'Nothing to undo.' };
  return { ok: true, card: { ...card, undone: true }, text: 'Undone. Your plan is back exactly as it was.' };
}
