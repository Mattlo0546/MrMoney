import { Pin, ShoppingBag, ShoppingBasket, Tag, TrainFront, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { formatMoney } from '@/lib/engine';
import { VALUE_ICONS } from '@/components/ui/Value';
import type { Bucket, DayInfo, PurchaseItem } from './data';

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

/**
 * Chips for one day. Bills are one-off monthly payments and are listed separately (Spending plan panel), never on
 * the day. Spending-plan purchases are summarised by `dayHint` unless `itinerary` asks for them as chips too.
 */
export function chipsFor(day: DayInfo, preview?: ChipSpec[], opts: { itinerary?: boolean } = {}): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const e of day.entries) {
    out.push({ key: e.id, kind: e.kind === 'income' ? 'income' : 'actual', label: e.label, pence: e.pence, itemKey: `ledger:${e.id}` });
  }
  // One chip per planned purchase, under its own label. Category cells are never listed again.
  for (const p of day.purchases) if (opts.itinerary || p.source !== 'itinerary') out.push({ key: p.id, kind: 'planned', label: p.label, pence: p.pence, itemKey: `${day.date}|${p.category}` });
  if (preview) out.push(...preview);
  return out;
}

export const BUCKET_ICON: Record<Bucket, LucideIcon> = {
  groceries: ShoppingBasket, transport: TrainFront, eatingOut: UtensilsCrossed, shopping: ShoppingBag, other: Tag,
};
export const BUCKET_LABEL: Record<Bucket, string> = {
  groceries: 'Groceries', transport: 'Transport', eatingOut: 'Eating out', shopping: 'Shopping', other: 'Other',
};
const BUCKET_ORDER: Bucket[] = ['eatingOut', 'shopping', 'groceries', 'transport', 'other'];

/** "Dinner: egg fried rice" -> "egg fried rice". */
export const stripPrefix = (label: string) => label.replace(/^[^:]{1,24}:\s*/, '');

/** A tiny "why this day costs what it does" hint: the buckets in the day's spending plan and its headline item. */
export function dayHint(day: DayInfo): { buckets: Bucket[]; headline: PurchaseItem | null } {
  const itin = day.purchases.filter((p) => p.source === 'itinerary');
  if (!itin.length) return { buckets: [], headline: null };
  const buckets = BUCKET_ORDER.filter((b) => itin.some((p) => p.bucket === b));
  const treat = itin.find((p) => /treat|payday/i.test(p.reason ?? ''));
  const headline = treat ?? [...itin].sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || b.pence - a.pence)[0];
  return { buckets, headline };
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
      className={`flex w-fit min-w-0 max-w-full items-center gap-1 rounded-full ${compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-0.5 text-xs leading-4'} font-semibold ${style}`}
    >
      <Icon aria-hidden="true" strokeWidth={2.5} className={`${compact ? 'size-2' : 'size-3'} shrink-0`} />
      <span className="sr-only">{SR[chip.kind]}: </span>
      <span className="min-w-0 truncate" aria-hidden="true">{compact ? shortLabel(chip.label) : chip.label}</span>
      <span className="sr-only">{chip.label}</span>
      <span className="shrink-0 tabular-nums">{amount}</span>
    </span>
  );
}
