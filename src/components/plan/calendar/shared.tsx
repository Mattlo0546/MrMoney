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

export type ChipKind = 'actual' | 'income' | 'fixed' | 'planned' | 'preview';
export interface ChipSpec { key: string; kind: ChipKind; label: string; pence: number; itemKey?: string; negative?: boolean }

/** Preview chips for one day, supplied by the plan layout from the un-applied preview. */
export type PreviewChips = Map<string, ChipSpec[]>;

/** Shorter label for tight calendar cells; the full label stays available via the tooltip. */
export function shortLabel(label: string, max = 11): string {
  if (label.length <= max) return label;
  const first = label.split(/\s+/)[0];
  if (first.length >= 4 && first.length <= max) return first;
  return `${label.slice(0, max - 1)}…`;
}

export function chipsFor(day: DayInfo, preview?: ChipSpec[]): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const f of day.fixed) out.push({ key: f.id, kind: 'fixed', label: f.name, pence: f.pence });
  for (const e of day.entries) {
    out.push({ key: e.id, kind: e.kind === 'income' ? 'income' : 'actual', label: e.label, pence: e.pence, itemKey: `ledger:${e.id}` });
  }
  // One chip per planned purchase, under its own label. Category cells are never listed again.
  for (const p of day.purchases) out.push({ key: p.id, kind: 'planned', label: p.label, pence: p.pence, itemKey: `${day.date}|${p.category}` });
  if (preview) out.push(...preview);
  return out;
}

const SR = { actual: 'Spent', income: 'Received', fixed: 'Bill', planned: 'Planned', preview: 'Preview' } as const;

export function Chip({ chip, compact }: { chip: ChipSpec; compact?: boolean }) {
  const style = {
    actual: 'bg-[var(--accent)] text-[var(--accent-ink)]',
    income: 'bg-[var(--lime)] text-[#0B0C1F]',
    fixed: 'bg-[var(--navy)] text-white border border-[var(--accent)]',
    planned: 'border border-dashed border-[var(--line)] text-[var(--muted)]',
    preview: 'border border-dashed border-[var(--lime)] text-[var(--lime)]',
  }[chip.kind];
  const amount = `${chip.kind === 'income' ? '+' : chip.negative ? '−' : ''}${money(chip.pence)}`;
  return (
    <span
      data-item={chip.itemKey}
      data-chip={chip.kind}
      title={`${SR[chip.kind]}: ${chip.label} ${amount}`}
      className={`flex w-fit min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-4 ${style}`}
    >
      {chip.kind === 'fixed' && <PinIcon className="h-2.5 w-2.5 shrink-0" />}
      <span className="sr-only">{SR[chip.kind]}: </span>
      <span className="min-w-0 truncate" aria-hidden="true">{compact ? shortLabel(chip.label) : chip.label}</span>
      <span className="sr-only">{chip.label}</span>
      <span className="shrink-0 tabular-nums">{amount}</span>
    </span>
  );
}
