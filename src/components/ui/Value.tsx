import { createElement, type ReactNode } from 'react';
import {
  ArrowRightLeft, Banknote, BadgePercent, CalendarCheck, CalendarClock, CalendarDays, CalendarRange, ChartLine, Clock,
  Coins, Eye, HandCoins, Layers, ListChecks, ListOrdered, Percent, PiggyBank, Pin, PoundSterling, Receipt, Repeat,
  Scale, ShieldCheck, ShoppingBag, Sigma, Sparkles, Tag, Target, TrendingUp, TriangleAlert, UserCheck, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cx } from './cx';

/**
 * Icon-per-value rule: every rendered value (money, date, count, percentage, setting) sits next to an SVG icon
 * that names what it is. Pick icons from this map so the same kind of value always gets the same icon.
 */
export const VALUE_ICONS = {
  allowance: Wallet,        // "Left today", today's allowance, day totals
  flexible: Coins,          // flexible budget left
  balance: Banknote,        // funds / cash now
  spent: Receipt,           // money spent
  purchase: ShoppingBag,    // planned purchases
  income: TrendingUp,       // money received
  bills: Pin,               // fixed commitments
  reserve: ShieldCheck,     // minimum reserve
  savings: PiggyBank,       // savings / savings goal
  shortfall: TriangleAlert, // not covered / short
  date: CalendarDays,       // a calendar date
  checked: CalendarCheck,   // "checked on" / retrieved dates
  time: Clock,              // timestamps
  planned: CalendarClock,   // planned (not yet spent)
  days: CalendarRange,      // day counts and periods
  repeat: Repeat,           // recurrence
  preview: Eye,             // preview, not applied
  count: Layers,            // "+N more"
  percent: Percent,         // rates
  deal: BadgePercent,       // offers / discounts
  category: Tag,            // spending categories
  weight: Scale,            // category weights
  priority: ListOrdered,    // category priority
  eligibility: UserCheck,   // who an offer is for
  conditions: ListChecks,   // offer conditions
  investments: ChartLine,   // investments
  total: Sigma,             // totals
  contributed: HandCoins,   // money you put in
  growth: TrendingUp,       // growth
  move: ArrowRightLeft,     // money moved between days/categories
  goal: Target,             // goals
  pounds: PoundSterling,    // a generic amount
  sparkle: Sparkles,        // good news / AI
} satisfies Record<string, LucideIcon>;

export type ValueKind = keyof typeof VALUE_ICONS;
export type Tone = 'primary' | 'positive' | 'warning' | 'negative' | 'neutral' | 'onGradient';

const soft: Record<Tone, string> = {
  primary: 'bg-grad-primary-soft text-accent',
  positive: 'bg-grad-positive-soft text-pos',
  warning: 'bg-grad-warning-soft text-warn',
  negative: 'bg-grad-negative-soft text-neg',
  neutral: 'bg-surface-2 text-muted',
  onGradient: 'bg-white/20 text-white',
};
const solid: Record<Tone, string> = {
  primary: 'bg-grad-primary shadow-glow',
  positive: 'bg-grad-positive',
  warning: 'bg-grad-warning',
  negative: 'bg-grad-negative',
  neutral: 'bg-surface-2 text-text',
  onGradient: 'bg-white/20 text-white',
};
const badgeSize = { xs: 'size-5 rounded-md', sm: 'size-7 rounded-[9px]', md: 'size-9 rounded-[12px]', lg: 'size-11 rounded-[14px]' } as const;
const glyphSize = { xs: 12, sm: 15, md: 18, lg: 22 } as const;

export function iconFor(kind: ValueKind | LucideIcon): LucideIcon {
  return typeof kind === 'string' ? VALUE_ICONS[kind] : kind;
}

/** A tinted (or solid gradient) square holding one icon. Decorative: the label next to it carries the meaning. */
export function IconBadge({ icon, tone = 'primary', size = 'md', solid: isSolid, className }: {
  icon: ValueKind | LucideIcon; tone?: Tone; size?: keyof typeof badgeSize; solid?: boolean; className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx('inline-grid shrink-0 place-items-center', badgeSize[size], isSolid ? solid[tone] : soft[tone], className)}>
      {createElement(iconFor(icon), { size: glyphSize[size], strokeWidth: 2.2 })}
    </span>
  );
}

const inlineTone: Record<Tone, string> = {
  primary: 'text-accent', positive: 'text-pos', warning: 'text-warn', negative: 'text-neg', neutral: 'text-muted', onGradient: 'text-white/90',
};

/** Inline icon + value. The icon is aria-hidden; the text is unchanged for screen readers and tests. */
export function WithIcon({ icon, tone, size = 14, className, iconClassName, children }: {
  icon: ValueKind | LucideIcon; tone?: Tone; size?: number; className?: string; iconClassName?: string; children: ReactNode;
}) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      {createElement(iconFor(icon), { 'aria-hidden': 'true', size, strokeWidth: 2.3, className: cx('shrink-0', tone ? inlineTone[tone] : 'opacity-80', iconClassName) })}
      {children}
    </span>
  );
}

/**
 * Stat tile: icon badge + label + value, as <dt>/<dd> so it slots into a <dl>.
 * Extra lines (e.g. next income) go in `children` and render as further <dd>s.
 */
export function Stat({ icon, tone = 'primary', label, value, valueTestId, className, children }: {
  icon: ValueKind | LucideIcon; tone?: Tone; label: ReactNode; value: ReactNode; valueTestId?: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={cx('flex flex-col justify-center gap-1.5 rounded-3xl border border-line bg-surface p-4 shadow-soft', className)}>
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted">
        <IconBadge icon={icon} tone={tone} size="sm" />
        {label}
      </dt>
      <dd data-testid={valueTestId} className="font-display text-2xl font-extrabold tabular-nums tracking-tight">{value}</dd>
      {children}
    </div>
  );
}
