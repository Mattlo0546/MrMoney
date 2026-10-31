'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatMoney, formatShortDate, gbp } from '@/lib/engine';
import type { Category, EngineState, Intent } from '@/lib/engine';
import { useAppStore } from '@/lib/store';
import { applyTheme, readTheme } from '@/components/shell/theme';
import { Btn, Card, Field, PageFrame, parsePounds, penceToInput } from './kit';

type Errors = Record<string, string>;
interface CatDraft { id: string; name: string; weight: string; priority: string; essential: boolean }
interface Draft {
  horizonEnd: string; reserve: string; goal: string;
  cats: CatDraft[];
  incomes: Record<string, { amount: string; date: string; confirmed: boolean }>;
  commits: Record<string, string>;
}
interface NewBill { name: string; amount: string; kind: 'monthly' | 'once'; day: string; date: string }
const EMPTY_BILL: NewBill = { name: '', amount: '', kind: 'monthly', day: '', date: '' };
let keySeq = 0;
const key = (k: string): string => `settings-${k}-${Date.now()}-${keySeq++}`;

function toDraft(s: EngineState): Draft {
  return {
    horizonEnd: s.profile.horizonEnd,
    reserve: penceToInput(s.profile.minimumReserve.pence),
    goal: penceToInput(s.profile.savingsGoal.pence),
    cats: s.profile.categories.map((c) => ({ id: c.id, name: c.name, weight: String(c.weight), priority: String(c.priority), essential: c.essential })),
    incomes: Object.fromEntries(s.incomes.map((i) => [i.id, { amount: penceToInput(i.amount.pence), date: i.date, confirmed: i.confirmed }])),
    commits: Object.fromEntries(s.commitments.map((c) => [c.id, penceToInput(c.amount.pence)])),
  };
}
const ordinal = (n: number) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;

export function SettingsView() {
  const { snapshot, store } = useAppStore();
  const router = useRouter();
  const state = snapshot.state;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bill, setBill] = useState<NewBill>(EMPTY_BILL);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);
  const [confirmReset, setConfirmReset] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  if (state && !draft) setDraft(toDraft(state));
  useEffect(() => {
    if (confirmReset) cancelRef.current?.focus();
  }, [confirmReset]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(t);
  }, [saved]);

  function pickTheme(t: 'dark' | 'light') {
    setTheme(t);
    applyTheme(t);
  }

  if (!snapshot.hydrated) return <PageFrame title="Settings"><p className="text-[var(--p-muted)]">Loading…</p></PageFrame>;
  if (!state || !draft) {
    return (
      <PageFrame title="Settings">
        <Card title="No plan yet" hint="Set up your plan first, then come back to adjust it.">
          <Link href="/onboarding" className="inline-flex min-h-11 items-center rounded-full bg-[var(--p-accent)] px-5 font-bold text-[var(--p-accent-ink)]">Start setup</Link>
        </Card>
        <Card title="Appearance"><ThemeToggle theme={theme} onPick={pickTheme} /></Card>
      </PageFrame>
    );
  }
  const d = draft;
  const patch = (p: Partial<Draft>) => { setDraft({ ...d, ...p }); setSaved(false); };

  function validate(): Errors {
    const e: Errors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.horizonEnd)) e.horizonEnd = 'Enter a valid end date.';
    else if (d.horizonEnd < snapshot.today) e.horizonEnd = 'The end date must be today or later.';
    if (parsePounds(d.reserve, false) === null) e.reserve = 'Enter a reserve of 0 or more, e.g. 150';
    if (parsePounds(d.goal, false) === null) e.goal = 'Enter a savings goal of 0 or more, e.g. 200';
    d.cats.forEach((c, i) => {
      if (!c.name.trim()) e[`cat.${i}.name`] = 'Give it a name.';
      if (!/^\d+(\.\d+)?$/.test(c.weight.trim())) e[`cat.${i}.weight`] = 'Weight must be 0 or more.';
      if (!/^\d+$/.test(c.priority.trim())) e[`cat.${i}.priority`] = 'Whole number, 1 = most protected.';
    });
    if (d.cats.length && !d.cats.some((c) => Number(c.weight) > 0)) e.categories = 'At least one category needs a weight above 0.';
    state!.incomes.forEach((inc) => {
      const x = d.incomes[inc.id];
      if (!x) return;
      if (parsePounds(x.amount, false) === null) e[`inc.${inc.id}.amount`] = 'Enter an amount in pounds.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) e[`inc.${inc.id}.date`] = 'Enter a valid date.';
    });
    state!.commitments.forEach((c) => {
      if (parsePounds(d.commits[c.id] ?? '', false) === null) e[`com.${c.id}`] = 'Enter an amount in pounds.';
    });
    return e;
  }

  function save() {
    const s = state!;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { setSaved(false); return; }
    const fail = (m: string) => { setErrors({ _: m }); setSaved(false); };

    const cats: Category[] = s.profile.categories.map((c, i) => ({
      ...c, name: d.cats[i].name.trim(), weight: Number(d.cats[i].weight), priority: Number(d.cats[i].priority), essential: d.cats[i].essential,
    }));
    const reserve = parsePounds(d.reserve) ?? 0;
    const goal = parsePounds(d.goal) ?? 0;
    const changed =
      d.horizonEnd !== s.profile.horizonEnd || reserve !== s.profile.minimumReserve.pence || goal !== s.profile.savingsGoal.pence ||
      JSON.stringify(cats) !== JSON.stringify(s.profile.categories);
    if (changed) {
      const intent: Intent = {
        kind: 'settingsEdit', idempotencyKey: key('profile'),
        patch: { horizonEnd: d.horizonEnd, minimumReserve: gbp(reserve), savingsGoal: gbp(goal), categories: cats },
      };
      const r = store.apply(intent);
      if (!r.ok) return fail(r.error?.message ?? 'Could not save those settings.');
    }
    for (const c of s.commitments) {
      const pence = parsePounds(d.commits[c.id]) ?? 0;
      if (pence === c.amount.pence) continue;
      const r = store.apply({
        kind: 'commitmentChange', idempotencyKey: key(`bill-${c.id}`),
        change: { op: 'set', target: c.id, amount: gbp(pence), effectiveFrom: snapshot.today },
      });
      if (!r.ok) return fail(r.error?.message ?? `Could not change ${c.name}.`);
    }
    for (const inc of s.incomes) {
      const x = d.incomes[inc.id];
      const pence = parsePounds(x.amount) ?? 0;
      if (pence === inc.amount.pence && x.date === inc.date && x.confirmed === inc.confirmed) continue;
      const r = store.editEntry({ type: 'income', id: inc.id, patch: { amount: gbp(pence), date: x.date, confirmed: x.confirmed } });
      if (!r.ok) return fail(r.error?.message ?? 'Could not change that income.');
    }
    const fresh = store.getSnapshot().state;
    if (fresh) setDraft(toDraft(fresh));
    setErrors({});
    setSaved(true);
  }

  function addBill() {
    const amt = parsePounds(bill.amount, false);
    const e: Errors = {};
    if (!bill.name.trim()) e.billName = 'What is it called?';
    if (amt === null || amt === 0) e.billAmount = 'Enter an amount in pounds.';
    const day = Number(bill.day);
    if (bill.kind === 'monthly' && !(Number.isInteger(day) && day >= 1 && day <= 31)) e.billDay = 'Pick a day from 1 to 31.';
    if (bill.kind === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(bill.date)) e.billDate = 'Pick a due date.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = store.apply({
      kind: 'commitmentChange', idempotencyKey: key('bill-add'),
      change: {
        op: 'add', name: bill.name.trim(), amount: gbp(amt ?? 0),
        recurrence: bill.kind === 'monthly' ? { kind: 'monthly', dayOfMonth: day } : { kind: 'once', date: bill.date },
      },
    });
    if (!r.ok) { setErrors({ _: r.error?.message ?? r.needsClarification?.question ?? 'Could not add that bill.' }); return; }
    const fresh = store.getSnapshot().state;
    if (fresh) setDraft(toDraft(fresh));
    setBill(EMPTY_BILL);
    setSaved(true);
  }

  function removeBill(id: string) {
    const r = store.apply({
      kind: 'commitmentChange', idempotencyKey: key('bill-rm'),
      change: { op: 'remove', target: id, effectiveFrom: snapshot.today },
    });
    if (!r.ok) { setErrors({ _: r.error?.message ?? 'Could not remove that bill.' }); return; }
    const fresh = store.getSnapshot().state;
    if (fresh) setDraft(toDraft(fresh));
    setSaved(true);
  }

  const p = state.profile;
  const setCat = (i: number, c: Partial<CatDraft>) => patch({ cats: d.cats.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const live = state.commitments.filter((c) => !(c.amountChanges?.some((a) => a.amount.pence === 0) && c.amountChanges.at(-1)?.amount.pence === 0));

  return (
    <PageFrame title="Settings">
      {errors._ && <p role="alert" className="rounded-[16px] border border-[var(--p-coral)] p-4 font-semibold text-[var(--p-coral)]">{errors._}</p>}

      <Card title="Money" hint="Funds are set during setup and can't be edited here yet.">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-semibold text-[var(--p-muted)]">{p.fundsType === 'lump' ? 'Lump sum' : 'Monthly allowance'}</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{formatMoney(p.funds)}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--p-muted)]">Type</dt>
            <dd className="text-lg font-bold">{p.fundsType === 'lump' ? 'Lump sum' : 'Monthly'}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <Field id="horizonEnd" label="Money needs to last until" type="date" value={d.horizonEnd} onChange={(e) => patch({ horizonEnd: e.target.value })} error={errors.horizonEnd} />
        </div>
      </Card>

      <Card title="Protected amounts" hint="Only changed here, on purpose. Reallocation never touches these.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="reserve" label="Minimum reserve" prefix="£" inputMode="decimal" value={d.reserve} onChange={(e) => patch({ reserve: e.target.value })} error={errors.reserve} />
          <Field id="goal" label="Savings goal" prefix="£" inputMode="decimal" value={d.goal} onChange={(e) => patch({ goal: e.target.value })} error={errors.goal} />
        </div>
      </Card>

      <Card title="Rent and commitments" hint="Changing an amount applies from today. Past bills stay as they were.">
        <ul className="flex flex-col gap-4">
          {live.map((c) => (
            <li key={c.id} className="rounded-[16px] bg-[var(--p-surface2)] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-sm text-[var(--p-muted)]">
                    {c.recurrence.kind === 'monthly' ? `Monthly, due on the ${ordinal(c.recurrence.dayOfMonth)}` : `Once, ${formatShortDate(c.recurrence.date)}`}
                  </p>
                </div>
                <Btn variant="ghost" className="shrink-0 !px-4" onClick={() => removeBill(c.id)} aria-label={`Remove ${c.name}`}>Remove</Btn>
              </div>
              <Field id={`com-${c.id}`} label="Amount" prefix="£" inputMode="decimal" value={d.commits[c.id] ?? ''} onChange={(e) => patch({ commits: { ...d.commits, [c.id]: e.target.value } })} error={errors[`com.${c.id}`]} />
            </li>
          ))}
          {live.length === 0 && <li className="text-[var(--p-muted)]">No commitments yet.</li>}
        </ul>
        <div className="mt-5 rounded-[16px] border border-dashed border-[var(--p-line)] p-4">
          <p className="mb-3 font-bold">Add a bill</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="billName" label="Name" value={bill.name} onChange={(e) => setBill({ ...bill, name: e.target.value })} error={errors.billName} />
            <Field id="billAmount" label="Amount" prefix="£" inputMode="decimal" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} error={errors.billAmount} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="billKind" className="text-sm font-semibold text-[var(--p-muted)]">Repeats</label>
              {/* TODO(reui): replace native select with the ReUI dropdown composition */}
              <select id="billKind" value={bill.kind} onChange={(e) => setBill({ ...bill, kind: e.target.value as 'monthly' | 'once' })} className="min-h-12 rounded-[16px] border border-[var(--p-line)] bg-[var(--p-surface2)] px-4">
                <option value="monthly">Every month</option>
                <option value="once">Once</option>
              </select>
            </div>
            {bill.kind === 'monthly'
              ? <Field id="billDay" label="Due day of month" inputMode="numeric" placeholder="1 to 31" value={bill.day} onChange={(e) => setBill({ ...bill, day: e.target.value })} error={errors.billDay} />
              : <Field id="billDate" label="Due date" type="date" value={bill.date} onChange={(e) => setBill({ ...bill, date: e.target.value })} error={errors.billDate} />}
          </div>
          <Btn className="mt-4" variant="ghost" onClick={addBill}>Add bill</Btn>
        </div>
      </Card>

      <Card title="Income" hint="Only confirmed income feeds your plan.">
        <ul className="flex flex-col gap-4">
          {state.incomes.map((inc) => {
            const x = d.incomes[inc.id];
            if (!x) return null;
            const set = (q: Partial<typeof x>) => patch({ incomes: { ...d.incomes, [inc.id]: { ...x, ...q } } });
            return (
              <li key={inc.id} className="rounded-[16px] bg-[var(--p-surface2)] p-4">
                <p className="mb-3 font-bold">{inc.note || (inc.source === 'job' ? 'Job' : 'Other income')}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`inc-a-${inc.id}`} label="Amount" prefix="£" inputMode="decimal" value={x.amount} onChange={(e) => set({ amount: e.target.value })} error={errors[`inc.${inc.id}.amount`]} />
                  <Field id={`inc-d-${inc.id}`} label="Date" type="date" value={x.date} onChange={(e) => set({ date: e.target.value })} error={errors[`inc.${inc.id}.date`]} />
                </div>
                <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
                  <input type="checkbox" className="size-6 accent-[var(--p-accent)]" checked={x.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} />
                  Confirmed
                </label>
              </li>
            );
          })}
          {state.incomes.length === 0 && <li className="text-[var(--p-muted)]">No income recorded.</li>}
        </ul>
      </Card>

      <Card title="Categories and priorities" hint="Priority 1 is the most protected. Weight sets each category's share of the day.">
        {errors.categories && <p role="alert" className="mb-3 text-sm font-semibold text-[var(--p-coral)]">{errors.categories}</p>}
        <ul className="flex flex-col gap-4">
          {d.cats.map((c, i) => (
            <li key={c.id} className="rounded-[16px] bg-[var(--p-surface2)] p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <Field id={`cat-n-${i}`} label="Name" value={c.name} onChange={(e) => setCat(i, { name: e.target.value })} error={errors[`cat.${i}.name`]} />
                </div>
                <Field id={`cat-w-${i}`} label="Weight" inputMode="decimal" value={c.weight} onChange={(e) => setCat(i, { weight: e.target.value })} error={errors[`cat.${i}.weight`]} />
                <Field id={`cat-p-${i}`} label="Priority" inputMode="numeric" value={c.priority} onChange={(e) => setCat(i, { priority: e.target.value })} error={errors[`cat.${i}.priority`]} />
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
                <input type="checkbox" className="size-6 accent-[var(--p-accent)]" checked={c.essential} onChange={(e) => setCat(i, { essential: e.target.checked })} />
                Essential
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Appearance"><ThemeToggle theme={theme} onPick={pickTheme} /></Card>

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] p-2 pl-5 shadow-lg">
        <p role="status" className="min-w-0 flex-1 text-sm font-bold leading-tight text-[var(--p-lime)]">{saved ? 'Saved — plan updated' : ''}</p>
        <Btn onClick={save}>Save changes</Btn>
      </div>

      <Card title="Danger zone" tone="danger" hint="Starts you over from scratch.">
        <Btn variant="danger" onClick={() => setConfirmReset(true)}>Reset StudentPlan</Btn>
      </Card>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onKeyDown={(e) => e.key === 'Escape' && setConfirmReset(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="reset-t" aria-describedby="reset-d" className="w-full max-w-md rounded-[24px] border border-[var(--p-line)] bg-[var(--p-surface)] p-6">
            <h2 id="reset-t" className="text-2xl font-extrabold">Reset StudentPlan?</h2>
            <p id="reset-d" className="mt-2 text-[var(--p-muted)]">This deletes your plan, ledger and settings from this device. It can&apos;t be undone.</p>
            <div className="mt-6 flex gap-3">
              <Btn ref={cancelRef} variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Btn>
              <Btn variant="danger" className="flex-1" onClick={() => { store.reset(); setConfirmReset(false); router.replace('/onboarding'); }}>Reset</Btn>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function ThemeToggle({ theme, onPick }: { theme: 'dark' | 'light'; onPick: (t: 'dark' | 'light') => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
      {(['dark', 'light'] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => onPick(t)}
          className={`min-h-12 rounded-full font-bold capitalize ${theme === t ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]' : 'border border-[var(--p-line)] bg-[var(--p-surface2)]'}`}>
          {t}
        </button>
      ))}
    </div>
  );
}
