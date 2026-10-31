import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatMoney } from '@/lib/engine';
import { cx } from './cx';
import { iconFor, type Tone, type ValueKind } from './Value';

export interface MoneyProps {
  pence: number;
  /** Render struck through (old value). */
  strike?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Always show two decimals (e.g. £25.00). Default uses the engine formatter. */
  fixed?: boolean;
  /** Icon shown before the amount (icon-per-value rule). Defaults to a pound sign; pass `false` only inside a parent that already shows one. */
  icon?: ValueKind | LucideIcon | false;
  iconTone?: Tone;
  className?: string;
}

const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl', xl: 'text-5xl md:text-6xl' } as const;
const iconSizes = { sm: 13, md: 15, lg: 24, xl: 36 } as const;
const tones: Record<Tone, string> = {
  primary: 'text-accent', positive: 'text-pos', warning: 'text-warn', negative: 'text-neg', neutral: 'text-muted', onGradient: 'text-white/90',
};

function fixedFormat(p: number): string {
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${p < 0 ? '-' : ''}£${pounds}.${(abs % 100).toString().padStart(2, '0')}`;
}

export function Money({ pence, strike, size = 'md', fixed, icon = 'pounds', iconTone, className }: MoneyProps) {
  const text = fixed ? fixedFormat(pence) : formatMoney(pence);
  return (
    <span
      className={cx('money inline-flex items-center gap-1.5 tabular-nums', sizes[size], size === 'xl' && 'font-extrabold tracking-tight', strike && 'line-through opacity-60', className)}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {icon && createElement(iconFor(icon), { 'aria-hidden': 'true', size: iconSizes[size], strokeWidth: 2.3, className: cx('shrink-0', iconTone ? tones[iconTone] : 'opacity-80') })}
      {strike && <span className="sr-only">was </span>}
      {text}
    </span>
  );
}
