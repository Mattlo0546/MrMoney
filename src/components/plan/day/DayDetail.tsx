'use client';
import { useState } from 'react';
import { formatMoney, gbp } from '@/lib/engine';
import type { ISODate } from '@/lib/engine';
import { getAppStore } from '@/lib/store';
import type { Bucket, DayInfo, EntryItem, PurchaseItem } from '../calendar/data';
import { BUCKET_ICON, BUCKET_LABEL } from '../calendar/shared';
import { IconBadge, WithIcon } from '@/components/ui/Value';
import { ChevronDown, ExternalLink, Sparkles } from 'lucide-react';

const GROUP_ORDER: Bucket[] = ['groceries', 'eatingOut', 'transport', 'shopping', 'other'];

/** "www.tesco.com" -> "tesco.com"; falls back to the URL's host. */
function domainOf(domain: string | undefined, url: string): string {
  if (domain) return domain.replace(/^www\./, '');
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** One planned purchase with its itemised lines (every penny traced to a real item and link). */
export function PurchaseCard({ p, changed }: { p: PurchaseItem; changed: boolean }) {
  const [open, setOpen] = useState(true);
  const id = `lines-${p.id}`;
  const lines = p.lines ?? [];
  return (
    <li data-item={`${p.id}`} className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-soft ${changed ? 'ring-2 ring-accent-2 ring-offset-2 ring-offset-surface' : ''}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
        <IconBadge icon={BUCKET_ICON[p.bucket]} tone="primary" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{p.label}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {p.reason && <span className="inline-flex rounded-full bg-grad-primary-soft px-2 py-0.5 text-[11px] font-bold text-accent">{p.reason}</span>}
            {p.dealTitle && (
              <span className="inline-flex items-center gap-1 rounded-full bg-grad-positive-soft px-2 py-0.5 text-[11px] font-bold text-pos">
                <IconBadge icon="deal" tone="positive" size="xs" className="!bg-transparent" />
                {p.dealTitle}{p.dealPercentOff ? ` (-${p.dealPercentOff}%)` : ''}
              </span>
            )}
          </span>
        </span>
        <span className="flex flex-col items-end tabular-nums">
          <span className={`font-display text-lg font-extrabold ${p.originalPence !== undefined && p.originalPence > p.pence ? 'text-pos' : ''}`}>{formatMoney(p.pence)}</span>
          {p.originalPence !== undefined && p.originalPence > p.pence && (
            <span className="text-xs font-semibold text-muted line-through">{formatMoney(p.originalPence)}</span>
          )}
        </span>
        <ChevronDown aria-hidden="true" size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && lines.length > 0 && (
        <ul id={id} aria-label={`Items for ${p.label}`} className="flex flex-col divide-y divide-line border-t border-line">
          {lines.map((l, i) => {
            const dom = domainOf(l.ref.domain, l.ref.sourceUrl);
            const listed = l.ref.pricePence;
            return (
              <li key={`${l.ref.id}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.name}{l.qty && <span className="font-normal text-muted"> · {l.qty}</span>}</span>
                  <span className="block text-xs text-muted">
                    {l.ref.merchant}{dom && dom !== l.ref.merchant.toLowerCase() ? ` (${dom})` : ''}
                    {listed != null && listed !== l.pence ? ` · ${formatMoney(listed)}${l.ref.detail ? ` for ${l.ref.detail}` : ''}` : l.ref.detail ? ` · ${l.ref.detail}` : ''}
                  </span>
                  {l.note && <span className="block text-xs font-semibold text-pos">{l.note}</span>}
                  {l.dealTitle && <span className="block text-xs font-semibold text-pos">Discounted with {l.dealTitle}</span>}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={`block font-bold ${l.pence === 0 ? 'text-muted' : l.originalPence && l.originalPence > l.pence ? 'text-pos' : ''}`}>{l.pence === 0 ? '£0' : formatMoney(l.pence)}</span>
                  {l.originalPence !== undefined && l.originalPence > l.pence && (
                    <span className="block text-[11px] font-semibold text-muted line-through">{formatMoney(l.originalPence)}</span>
                  )}
                </span>
                {l.ref.sourceUrl && (
                  <a href={l.ref.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="-my-1 grid size-11 shrink-0 place-items-center rounded-full text-accent hover:bg-surface-2">
                    <ExternalLink aria-hidden="true" size={15} />
                    <span className="sr-only">Open {l.name} at {l.ref.merchant} (opens in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

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
    <li data-item={`ledger:${e.id}`} className={`rounded-2xl px-3 py-2 ${e.kind === 'income' ? 'bg-grad-positive' : 'bg-grad-primary'} ${changed ? 'ring-2 ring-accent-2 ring-offset-2 ring-offset-surface' : ''}`}>
      <div className="flex items-center gap-2">
        <IconBadge icon={e.kind === 'income' ? 'income' : 'spent'} tone="onGradient" size="sm" />
        <span className="min-w-0 flex-1 truncate font-semibold"><span className="sr-only">{e.kind === 'income' ? 'Received: ' : 'Spent: '}</span>{e.kind === 'income' ? `Income${e.note ? ` · ${e.note}` : ''}` : `${e.label}${e.note ? ` · ${e.note}` : ''}`}</span>
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`amt-${e.id}`}>Amount in pounds</label>
            <input id={`amt-${e.id}`} inputMode="decimal" autoFocus value={val} onChange={(ev) => setVal(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') setEditing(false); }}
              className="h-11 w-24 rounded-2xl bg-surface px-3 text-right tabular-nums text-text" />
            <button type="button" onClick={save} className="min-h-11 rounded-full bg-surface px-3 text-sm font-bold text-text">Save</button>
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
  const itin = info.purchases.filter((p) => p.source === 'itinerary');
  const others = info.purchases.filter((p) => p.source !== 'itinerary');
  const itinGroups = GROUP_ORDER.map((b) => [b, itin.filter((p) => p.bucket === b)] as const).filter(([, l]) => l.length > 0);
  const when = info.date < today ? 'Past' : info.date === today ? 'Today' : 'Upcoming';
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm font-semibold text-muted">{when}</p>
        <h3 className="flex items-center gap-2 font-display text-xl font-extrabold"><IconBadge icon="date" tone="primary" size="sm" />{longDate(info.date)}</h3>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-grad-primary-soft p-3">
          <IconBadge icon="allowance" tone="primary" size="lg" solid />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Planned for the day</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <p className={`font-display text-4xl font-extrabold leading-tight tabular-nums ${info.savedPence > 0 ? 'text-pos' : 'text-grad-primary'}`}>{formatMoney(info.total)}</p>
              {info.savedPence > 0 && (
                <span className="text-base font-semibold text-muted line-through tabular-nums">{formatMoney(info.originalTotal)}</span>
              )}
            </div>
            {info.savedPence > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-grad-positive-soft px-2.5 py-0.5 text-xs font-bold text-pos">
                <IconBadge icon="deal" tone="positive" size="xs" className="!bg-transparent" />
                Saved {formatMoney(info.savedPence)} today{info.dealLabels.length ? ` · ${info.dealLabels.slice(0, 2).join(', ')}` : ''}
              </p>
            )}
          </div>
        </div>
      </header>

      {info.deficits.length > 0 && (
        <div role="status" className="flex gap-3 rounded-2xl border border-neg/25 bg-grad-negative-soft p-3 text-sm">
          <IconBadge icon="shortfall" tone="negative" size="sm" solid />
          <div>{info.deficits.map((d, i) => <p key={i}><span className="font-bold text-neg">Short by {formatMoney(d.amount)}.</span> {d.reason}</p>)}</div>
        </div>
      )}

      {itinGroups.length > 0 && (
        <section aria-label="Spending plan for the day">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted"><Sparkles aria-hidden="true" size={14} className="text-accent" />What the money is for</h4>
          <div className="flex flex-col gap-3">
            {itinGroups.map(([bucket, items]) => {
              const Icon = BUCKET_ICON[bucket];
              return (
                <div key={bucket}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                    <Icon aria-hidden="true" size={13} strokeWidth={2.4} className="text-accent" />{BUCKET_LABEL[bucket]}
                    <span className="ml-auto tabular-nums normal-case tracking-normal">{formatMoney(items.reduce((a, p) => a + p.pence, 0))}</span>
                  </p>
                  <ul className="flex flex-col gap-2">{items.map((p) => <PurchaseCard key={p.id} p={p} changed={changed.has(`${info.date}|${p.category}`)} />)}</ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(info.items.length > 0 || others.length > 0 || itinGroups.length === 0) && (
      <section aria-label="Planned by category">
        <h4 className="mb-2 text-sm font-bold text-muted">{itinGroups.length > 0 ? 'Also planned' : 'Planned by category'}</h4>
        {info.items.length === 0 && others.length === 0 ? <p className="text-sm text-muted">No flexible money planned.</p> : (
          <ul className="flex flex-col gap-1.5">
            {info.items.map((it) => (
              <li key={it.category} data-item={`${info.date}|${it.category}`}
                className={`flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-3 py-2 text-muted ${changed.has(`${info.date}|${it.category}`) ? 'ring-2 ring-accent-2' : ''}`}>
                <IconBadge icon="category" tone="neutral" size="sm" />
                <span className="flex-1 font-semibold text-text">{it.name}</span>
                <WithIcon icon="planned" tone="primary" size={13} className="tabular-nums">Planned {formatMoney(it.planned)}</WithIcon>
              </li>
            ))}
            {others.map((p) => p.lines?.length ? <PurchaseCard key={p.id} p={p} changed={false} /> : (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-3 py-2 text-muted">
                <IconBadge icon="purchase" tone="neutral" size="sm" />
                <span className="min-w-0 flex-1 font-semibold text-text">
                  {p.label}
                  {p.dealTitle && <span className="ml-1.5 rounded-full bg-grad-positive-soft px-2 py-0.5 text-[11px] font-bold text-pos">{p.dealTitle}</span>}
                </span>
                {p.originalPence !== undefined && p.originalPence > p.pence && (
                  <span className="text-xs font-semibold text-muted line-through tabular-nums">{formatMoney(p.originalPence)}</span>
                )}
                <WithIcon icon="reserve" tone="primary" size={13} className="tabular-nums">Set aside {formatMoney(p.pence)}</WithIcon>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <section aria-label="Spent and received">
        <h4 className="mb-2 text-sm font-bold text-muted">Spent and received</h4>
        {info.entries.length === 0 ? <p className="text-sm text-muted">Nothing recorded yet.</p> : (
          <ul className="flex flex-col gap-1.5">{info.entries.map((e) => <EntryRow key={e.id + e.pence} e={e} changed={changed.has(`ledger:${e.id}`)} />)}</ul>
        )}
      </section>
    </div>
  );
}
