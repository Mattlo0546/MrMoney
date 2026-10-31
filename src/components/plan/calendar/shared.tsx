import { formatMoney } from '@/lib/engine';
import type { DayInfo } from './data';

export const money = (p: number) => formatMoney(p);

export function PinIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.5 1.5 14.5 6.5l-1.6.6-2.3 2.3.3 3.2-1 1L6.7 10.6 3 14.3 1.7 13l3.7-3.7L2.6 6.5l1-1 3.2.3 2.3-2.3z" />
    </svg>
  );
}

export interface ChipSpec { key: string; kind: 'actual' | 'fixed' | 'planned'; label: string; pence: number; itemKey?: string }

export function chipsFor(day: DayInfo, changed: Set<string>): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const f of day.fixed) out.push({ key: f.id, kind: 'fixed', label: f.name, pence: f.pence });
  for (const e of day.entries) {
    out.push({ key: e.id, kind: 'actual', label: e.kind === 'income' ? `+ ${e.label}` : e.label, pence: e.pence, itemKey: `ledger:${e.id}` });
  }
  for (const p of day.purchases) out.push({ key: p.id, kind: 'planned', label: p.label, pence: p.pence });
  for (const it of day.items) {
    const k = `${day.date}|${it.category}`;
    if (changed.has(k)) out.push({ key: k, kind: 'planned', label: it.name, pence: it.planned, itemKey: k });
  }
  return out;
}

export function Chip({ chip, compact }: { chip: ChipSpec; compact?: boolean }) {
  const style =
    chip.kind === 'actual'
      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
      : chip.kind === 'fixed'
        ? 'bg-[var(--navy)] text-white border border-[var(--line)]'
        : 'border border-dashed border-[var(--line)] text-[var(--muted)]';
  const sr = chip.kind === 'actual' ? 'Spent' : chip.kind === 'fixed' ? 'Fixed' : 'Planned';
  return (
    <span
      data-item={chip.itemKey}
      className={`flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-4 ${style}`}
    >
      {chip.kind === 'fixed' && <PinIcon className="h-2.5 w-2.5 shrink-0" />}
      <span className="sr-only">{sr}: </span>
      <span className="truncate">{chip.label}</span>
      <span className="ml-auto shrink-0 tabular-nums">{money(chip.pence)}</span>
    </span>
  );
}
