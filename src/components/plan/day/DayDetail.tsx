'use client';
import { useState } from 'react';
import { formatMoney, gbp } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import { getAppStore } from '@/lib/store';
import type { DayInfo, EntryItem } from '../calendar/data';
import { PinIcon } from '../calendar/shared';

const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const longDate = (d: ISODate) => LONG.format(new Date(`${d}T00:00:00Z`));

function EntryRow({ e, changed }: { e: EntryItem; changed: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const type = e.kind === 'income' ? 'income' : 'ledger';
  const save = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return setErr('Enter an amount above £0.');
    const r = getAppStore().editEntry({ type, id: e.id, patch: { amount: gbp(Math.round(n * 100)) } } as Parameters<ReturnType<typeof getAppStore>['editEntry']>[0]);
    if (!r.ok) return setErr(r.error?.message ?? 'Could not save.');
    setEditing(false);
    setErr('');
  };
  const remove = () => {
    const r = getAppStore().editEntry({ type, id: e.id, remove: true } as Parameters<ReturnType<typeof getAppStore>['editEntry']>[0]);
    if (!r.ok) setErr(r.error?.message ?? 'Could not delete.');
  };
  return (
    <li data-item={`ledger:${e.id}`} className={`rounded-2xl px-3 py-2 ${e.kind === 'income' ? 'bg-[var(--lime)] text-[#0B0C1F]' : 'bg-[var(--accent)] text-[var(--accent-ink)]'} ${changed ? 'ring-2 ring-[var(--lime)]' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold"><span className="sr-only">{e.kind === 'income' ? 'Received: ' : 'Spent: '}</span>{e.kind === 'income' ? `Income${e.note ? ` · ${e.note}` : ''}` : `${e.label}${e.note ? ` · ${e.note}` : ''}`}</span>
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`amt-${e.id}`}>Amount in pounds</label>
            <input id={`amt-${e.id}`} inputMode="decimal" autoFocus value={val} onChange={(ev) => setVal(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') setEditing(false); }}
              className="h-11 w-24 rounded-2xl bg-white px-3 text-right tabular-nums text-[#0F1024]" />
            <button type="button" onClick={save} className="min-h-11 rounded-full bg-white px-3 text-sm font-bold text-[#0F1024]">Save</button>
          </>
        ) : (
          <>
            <span className="font-bold tabular-nums">{e.kind === 'income' ? '+' : ''}{formatMoney(e.pence)}</span>
            <button type="button" onClick={() => { setVal((e.pence / 100).toFixed(2)); setEditing(true); }} className="min-h-11 px-2 text-sm font-bold underline">Edit</button>
            <button type="button" onClick={remove} aria-label={`Delete ${e.label} entry`} className="min-h-11 px-2 text-sm font-bold underline">Delete</button>
          </>
        )}
      </div>
      {err && <p role="alert" className="mt-1 text-sm font-semibold">{err}</p>}
    </li>
  );
}

export function DayDetail({ info, today, changed }: { info: DayInfo; today: ISODate; changed: Set<string> }) {
  const when = info.date < today ? 'Past' : info.date === today ? 'Today' : 'Upcoming';
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">{when}</p>
        <h3 className="font-display text-xl font-extrabold">{longDate(info.date)}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">Planned for the day</p>
        <p className="font-display text-4xl font-extrabold tabular-nums">{formatMoney(info.total)}</p>
      </header>

      {info.deficits.length > 0 && (
        <div role="status" className="rounded-2xl border border-[var(--coral)] p-3 text-sm">
          {info.deficits.map((d, i) => <p key={i}><span className="font-bold text-[var(--coral)]">Short by {formatMoney(d.amount)}.</span> {d.reason}</p>)}
        </div>
      )}

      <section aria-label="Fixed commitments">
        <h4 className="mb-2 text-sm font-bold text-[var(--muted)]">Fixed commitments</h4>
        {info.fixed.length === 0 ? <p className="text-sm text-[var(--muted)]">Nothing fixed due today.</p> : (
          <ul className="flex flex-col gap-1.5">
            {info.fixed.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-2xl bg-[var(--navy)] px-3 py-2 text-white">
                <PinIcon className="h-3.5 w-3.5" /><span className="flex-1 font-semibold">{f.name}</span>
                <span className="font-bold tabular-nums">{formatMoney(f.pence)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Planned by category">
        <h4 className="mb-2 text-sm font-bold text-[var(--muted)]">Planned by category</h4>
        {info.items.length === 0 && info.purchases.length === 0 ? <p className="text-sm text-[var(--muted)]">No flexible money planned.</p> : (
          <ul className="flex flex-col gap-1.5">
            {info.items.map((it) => (
              <li key={it.category} data-item={`${info.date}|${it.category}`}
                className={`flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2 text-[var(--muted)] ${changed.has(`${info.date}|${it.category}`) ? 'ring-2 ring-[var(--lime)]' : ''}`}>
                <span className="flex-1 font-semibold">{it.name}</span>
                <span className="tabular-nums">Planned {formatMoney(it.planned)}</span>
              </li>
            ))}
            {info.purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2 text-[var(--muted)]">
                <span className="flex-1 font-semibold">{p.label}</span><span className="tabular-nums">Set aside {formatMoney(p.pence)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Spent and received">
        <h4 className="mb-2 text-sm font-bold text-[var(--muted)]">Spent and received</h4>
        {info.entries.length === 0 ? <p className="text-sm text-[var(--muted)]">Nothing recorded yet.</p> : (
          <ul className="flex flex-col gap-1.5">{info.entries.map((e) => <EntryRow key={e.id + e.pence} e={e} changed={changed.has(`ledger:${e.id}`)} />)}</ul>
        )}
      </section>
    </div>
  );
}
