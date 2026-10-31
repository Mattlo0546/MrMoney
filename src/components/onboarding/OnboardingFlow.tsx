'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAppStore, londonToday } from '@/lib/store';
import { Check, Choice, Field, MoneyInput, TextInput } from './fields';
import {
  DIETS, MEMBERSHIPS, STEPS, buildPayload, defaultForm, mapEngineErrors, stepOfField, uid, validateStep, type Errors, type Form,
} from './model';

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function OnboardingFlow() {
  const mounted = useMounted();
  if (!mounted) return <main className="ob" aria-busy="true" />;
  return <Flow />;
}

function StepArt({ slug }: { slug: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="ob-art" aria-hidden="true">
      {failed ? <span className="ob-art-fallback">✎</span> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/illustrations/${slug}.webp`} alt="" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function Flow() {
  const router = useRouter();
  const store = getAppStore();
  const [today] = useState(() => londonToday());
  const [f, setF] = useState<Form>(() => defaultForm(today));
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const focusKey = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; });
  };
  const clearErr = (key: string) => setErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });

  useEffect(() => {
    const key = focusKey.current;
    focusKey.current = null;
    if (key) document.getElementById(key)?.focus();
    else {
      const first = step > 0 ? document.querySelector<HTMLElement>('.ob-form input:not([type=radio]):not([type=checkbox]), .ob-form select') : null;
      (first ?? headingRef.current)?.focus({ preventScroll: true });
    }
  }, [step, errors]);

  const goto = (n: number, d: 'fwd' | 'back') => { setDir(d); setErrors({}); setBanner([]); setStep(n); window.scrollTo({ top: 0 }); };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    const errs = validateStep(step, f, today);
    if (step > 0 && Object.keys(errs).length) {
      // focus the first invalid field in DOM order after render
      focusKey.current = Object.keys(errs)[0];
      setErrors(errs);
      return;
    }
    if (step < STEPS.length - 1) return goto(step + 1, 'fwd');
    finish();
  };

  const finish = () => {
    for (let s = 1; s < STEPS.length; s++) {
      const errs = validateStep(s, f, today);
      if (Object.keys(errs).length) {
        goto(s, 'back');
        setTimeout(() => { focusKey.current = Object.keys(errs)[0]; setErrors(errs); }, 0);
        return;
      }
    }
    setBusy(true);
    const { profile, commitments, incomes, extras } = buildPayload(f, today);
    const res = store.completeOnboarding(profile, { commitments, incomes });
    if (!res.ok) {
      setBusy(false);
      const jobCount = f.hasJob ? f.jobDates.length : 0;
      const mapped = mapEngineErrors(res.errors, jobCount);
      const keys = Object.keys(mapped);
      setBanner(Object.values(res.errors));
      if (keys.length) {
        const target = Math.min(...keys.map(stepOfField));
        if (target !== step) { setDir('back'); setStep(target); }
        focusKey.current = keys.find((k) => stepOfField(k) === target) ?? null;
        setErrors(mapped);
      }
      return;
    }
    try { localStorage.setItem('studentplan.onboardingExtras', JSON.stringify(extras)); } catch { /* storage may be blocked */ }
    router.push('/plan');
  };

  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && !e.defaultPrevented && (t === document.body || t === headingRef.current || t.closest?.('.ob-seg-opt, .ob-chip'))) {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const demo = () => { store.startDemo(); router.push('/plan'); };

  const err = (k: string) => errors[k];
  const s = STEPS[step];

  const body = (() => {
    switch (step) {
      case 1: return (
        <>
          <MoneyInput big id="funds" label="Amount" value={f.funds} onChange={(v) => set('funds', v)} error={err('funds')} />
          <Choice name="fundsType" legend="How does it arrive?" value={f.fundsType} onChange={(v) => set('fundsType', v)}
            options={[{ value: 'lump', label: 'One lump sum' }, { value: 'monthly', label: 'Monthly allowance' }]} />
          {f.fundsType === 'monthly' && (
            <div className="ob-row2">
              <TextInput id="allowanceDay" label="Arrives on day" inputMode="numeric" value={f.allowanceDay} onChange={(v) => set('allowanceDay', v)} error={err('allowanceDay')} hint="Day of the month, 1 to 31" />
              <MoneyInput id="openingBalance" label="Cash in hand now" value={f.openingBalance} onChange={(v) => set('openingBalance', v)} error={err('openingBalance')} />
            </div>
          )}
        </>
      );
      case 2: return (
        <TextInput id="horizonEnd" type="date" label="Last day" value={f.horizonEnd} onChange={(v) => set('horizonEnd', v)} error={err('horizonEnd')} hint="Changing this changes your daily amount." />
      );
      case 3: return (
        <>
          <Choice name="hasJob" legend="Do you earn from a job?" value={f.hasJob ? 'yes' : 'no'} onChange={(v) => set('hasJob', v === 'yes')}
            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          {f.hasJob && (
            <div className="ob-card">
              <MoneyInput id="jobAmount" label="Pay per payday (after tax)" value={f.jobAmount} onChange={(v) => set('jobAmount', v)} error={err('jobAmount')} />
              {f.jobDates.map((d, i) => (
                <div key={d.id} className="ob-row2" style={{ alignItems: 'end' }}>
                  <TextInput id={`jobDate.${i}`} type="date" label={`Pay date ${i + 1}`} value={d.date}
                    onChange={(v) => { setF((p) => ({ ...p, jobDates: p.jobDates.map((x, j) => (j === i ? { ...x, date: v } : x)) })); clearErr(`jobDate.${i}`); }} error={err(`jobDate.${i}`)} />
                  {f.jobDates.length > 1 && (
                    <button type="button" className="ob-btn ghost small" onClick={() => setF((p) => ({ ...p, jobDates: p.jobDates.filter((_, j) => j !== i) }))} aria-label={`Remove pay date ${i + 1}`}>Remove</button>
                  )}
                </div>
              ))}
              <button type="button" className="ob-btn ghost small" onClick={() => setF((p) => ({ ...p, jobDates: [...p.jobDates, { id: uid('jd'), date: '' }] }))}>+ Add a pay date</button>
              <Check id="jobConfirmed" label="This amount and these dates are confirmed" checked={f.jobConfirmed} onChange={(v) => set('jobConfirmed', v)} />
              <span className="ob-hint">Only confirmed pay is used in your plan. Unconfirmed pay appears in projections only.</span>
            </div>
          )}
        </>
      );
      case 4: return (
        <>
          {f.others.length === 0 && <p className="ob-sub">Family top-ups, a grant, a bursary payment. Add only what you know.</p>}
          {f.others.map((r, i) => {
            const upd = (patch: Partial<typeof r>) => setF((p) => ({ ...p, others: p.others.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
            return (
              <div key={r.id} className="ob-card">
                <div className="ob-row2">
                  <MoneyInput id={`other.${i}.amount`} label="Amount" value={r.amount} onChange={(v) => { upd({ amount: v }); clearErr(`other.${i}.amount`); }} error={err(`other.${i}.amount`)} />
                  <TextInput id={`other.${i}.date`} type="date" label="Date it arrives" value={r.date} onChange={(v) => { upd({ date: v }); clearErr(`other.${i}.date`); }} error={err(`other.${i}.date`)} />
                </div>
                <Check id={`other.${i}.confirmed`} label="Confirmed" checked={r.confirmed} onChange={(v) => upd({ confirmed: v })} />
                <button type="button" className="ob-link" onClick={() => setF((p) => ({ ...p, others: p.others.filter((_, j) => j !== i) }))}>Remove</button>
              </div>
            );
          })}
          <button type="button" className="ob-btn ghost" onClick={() => setF((p) => ({ ...p, others: [...p.others, { id: uid('inc'), amount: '', date: '', confirmed: true }] }))}>+ Add income</button>
        </>
      );
      case 5: return (
        <>
          {f.commits.map((c, i) => {
            const upd = (patch: Partial<typeof c>) => setF((p) => ({ ...p, commits: p.commits.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
            return (
              <div key={c.id} className="ob-card">
                {i === 0 ? <strong>Rent</strong> : (
                  <TextInput id={`commit.${i}.name`} label="What is it?" value={c.name} placeholder="Phone, gym, insurance" onChange={(v) => { upd({ name: v }); clearErr(`commit.${i}.name`); }} error={err(`commit.${i}.name`)} />
                )}
                <MoneyInput id={`commit.${i}.amount`} label="Amount" value={c.amount} onChange={(v) => { upd({ amount: v }); clearErr(`commit.${i}.amount`); }} error={err(`commit.${i}.amount`)} />
                <Choice name={`rec-${i}`} legend="How often?" value={c.recurrence} onChange={(v) => upd({ recurrence: v })}
                  options={[{ value: 'monthly', label: 'Every month' }, { value: 'once', label: 'Just once' }]} />
                {c.recurrence === 'monthly'
                  ? <TextInput id={`commit.${i}.day`} label="Due on day" inputMode="numeric" value={c.day} onChange={(v) => { upd({ day: v }); clearErr(`commit.${i}.day`); }} error={err(`commit.${i}.day`)} hint="Day of the month, 1 to 31" />
                  : <TextInput id={`commit.${i}.date`} type="date" label="Due date" value={c.date} onChange={(v) => { upd({ date: v }); clearErr(`commit.${i}.date`); }} error={err(`commit.${i}.date`)} />}
                {i > 0 && <button type="button" className="ob-link" onClick={() => setF((p) => ({ ...p, commits: p.commits.filter((_, j) => j !== i) }))}>Remove</button>}
              </div>
            );
          })}
          <button type="button" className="ob-btn ghost" onClick={() => setF((p) => ({ ...p, commits: [...p.commits, { id: uid('c'), name: '', amount: '', recurrence: 'monthly', day: '1', date: '' }] }))}>+ Add another bill</button>
        </>
      );
      case 6: return (
        <MoneyInput big id="reserve" label="Minimum emergency reserve" value={f.reserve} onChange={(v) => set('reserve', v)} error={err('reserve')} hint="Money your plan will always keep untouched." />
      );
      case 7: return (
        <>
          <MoneyInput big id="goal" label="Savings goal" value={f.goal} onChange={(v) => set('goal', v)} error={err('goal')} hint="Enter 0 if you are not saving right now." />
          <div className="ob-row2">
            <MoneyInput id="savings" label="Savings so far" value={f.savings} onChange={(v) => set('savings', v)} error={err('savings')} />
            <MoneyInput id="investments" label="Investments so far" value={f.investments} onChange={(v) => set('investments', v)} error={err('investments')} />
          </div>
        </>
      );
      case 8: return (
        <>
          <MoneyInput big id="food" label="Food per week" value={f.food} onChange={(v) => set('food', v)} error={err('food')} />
          <MoneyInput big id="transport" label="Transport per week" value={f.transport} onChange={(v) => set('transport', v)} error={err('transport')} />
        </>
      );
      case 9: return (
        <>
          <fieldset className="ob-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ob-label" style={{ marginBottom: 8 }}>Flexible spending, most protected first</legend>
            <ul className="ob-prio">
              {f.flex.map((c, i) => {
                const move = (d: number) => setF((p) => { const a = [...p.flex]; [a[i], a[i + d]] = [a[i + d], a[i]]; return { ...p, flex: a }; });
                return (
                  <li key={c.id}>
                    <span className="n" aria-hidden="true">{i + 1}</span>
                    <label className="ob-check grow" htmlFor={`flex-${c.id}`}>
                      <input id={`flex-${c.id}`} type="checkbox" checked={c.on} onChange={(e) => setF((p) => ({ ...p, flex: p.flex.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) }))} />
                      <span>{c.name}</span>
                    </label>
                    <button type="button" className="ob-icon" disabled={i === 0} onClick={() => move(-1)} aria-label={`Move ${c.name} up`}>↑</button>
                    <button type="button" className="ob-icon" disabled={i === f.flex.length - 1} onClick={() => move(1)} aria-label={`Move ${c.name} down`}>↓</button>
                  </li>
                );
              })}
            </ul>
            {err('categories') && <span className="ob-err" role="alert">{err('categories')}</span>}
          </fieldset>
          <TextInput id="city" label="City or area (optional)" value={f.city} onChange={(v) => set('city', v)} placeholder="Leeds" />
          <Field id="diet" label="Diet (optional)">
            {/* TODO(reui): replace native select with the ReUI dropdown composition */}
            <select id="diet" className="ob-select" value={f.diet} onChange={(e) => set('diet', e.target.value)}>
              {DIETS.map((d) => <option key={d} value={d}>{d || 'No preference'}</option>)}
            </select>
          </Field>
          <fieldset className="ob-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ob-label" style={{ marginBottom: 8 }}>Discount memberships (optional)</legend>
            <div className="ob-chips">
              {MEMBERSHIPS.map((m) => (
                <label key={m} className="ob-chip">
                  <input type="checkbox" checked={f.memberships.includes(m)} onChange={(e) => set('memberships', e.target.checked ? [...f.memberships, m] : f.memberships.filter((x) => x !== m))} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      );
      default: return <p className="ob-sub">A calm daily number, built from what you have and what you owe. Takes about two minutes.</p>;
    }
  })();

  return (
    <main className="ob">
      <div className="ob-wrap">
        <div className="ob-top">
          <div className="ob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
            {STEPS.map((x, i) => <span key={x.slug} className="ob-seg" data-done={i <= step}><i /></span>)}
          </div>
          <span className="ob-count">{step + 1}/{STEPS.length}</span>
          <button type="button" className="ob-demo" onClick={demo}>Try a demo student</button>
        </div>
        <form key={step} className="ob-step" data-dir={dir} onSubmit={next} noValidate>
          <StepArt slug={s.slug} />
          <div className="ob-form">
            <h1 tabIndex={-1} ref={headingRef} style={{ outline: 'none' }}>{s.title}</h1>
            {banner.length > 0 && (
              <div className="ob-banner" role="alert">
                <strong>We could not build your plan yet</strong>
                {banner.map((m, i) => <span key={i}>{m}</span>)}
              </div>
            )}
            {body}
            {Object.keys(errors).length > 0 && step > 0 && <span className="ob-err" role="status">Please fix the highlighted fields. Nothing you entered has been lost.</span>}
            {step === 0 ? (
              <div className="ob-welcome-actions">
                <button type="submit" className="ob-btn primary">Set up my plan</button>
                <button type="button" className="ob-btn ghost" onClick={demo}>Try a demo student</button>
              </div>
            ) : (
              <div className="ob-actions">
                <button type="button" className="ob-btn ghost" onClick={() => goto(step - 1, 'back')}>Back</button>
                <button type="submit" className="ob-btn primary" disabled={busy}>{step === STEPS.length - 1 ? 'Build my plan' : 'Next'}</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
