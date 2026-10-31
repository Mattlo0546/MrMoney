import { Pin } from 'lucide-react';
import { formatMoney } from '@/lib/engine';
import { VALUE_ICONS } from '@/components/ui/Value';
import type { DayInfo } from './data';

export const money = (p: number) => formatMoney(p);

export function PinIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return <Pin aria-hidden="true" strokeWidth={2.4} className={className} />;
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

/** One icon and one look per chip kind (shared with the legend). */
export const CHIP_ICON = {
  actual: VALUE_ICONS.spent, income: VALUE_ICONS.income, fixed: VALUE_ICONS.bills, planned: VALUE_ICONS.planned, preview: VALUE_ICONS.preview,
} as const;
export const CHIP_STYLE: Record<ChipKind, string> = {
  actual: 'bg-grad-primary',
  income: 'bg-grad-positive',
  fixed: 'bg-grad-warning',
  planned: 'border border-dashed border-line-strong bg-surface text-muted',
  preview: 'border border-dashed border-accent-2 bg-accent-soft text-accent',
};

export function Chip({ chip, compact }: { chip: ChipSpec; compact?: boolean }) {
  const style = CHIP_STYLE[chip.kind];
  const Icon = CHIP_ICON[chip.kind];
  const amount = `${chip.kind === 'income' ? '+' : chip.negative ? '−' : ''}${money(chip.pence)}`;
  return (
    <span
      data-item={chip.itemKey}
      data-chip={chip.kind}
      title={`${SR[chip.kind]}: ${chip.label} ${amount}`}
      className={`flex w-fit min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-4 ${style}`}
    >
      <Icon aria-hidden="true" strokeWidth={2.5} className={`${compact ? 'size-2.5' : 'size-3'} shrink-0`} />
      <span className="sr-only">{SR[chip.kind]}: </span>
      <span className="min-w-0 truncate" aria-hidden="true">{compact ? shortLabel(chip.label) : chip.label}</span>
      <span className="sr-only">{chip.label}</span>
      <span className="shrink-0 tabular-nums">{amount}</span>
    </span>
  );
}
