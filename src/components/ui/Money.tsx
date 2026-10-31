import { formatMoney } from '@/lib/engine';
import { cx } from './cx';

export interface MoneyProps {
  pence: number;
  /** Render struck through (old value). */
  strike?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Always show two decimals (e.g. £25.00). Default uses the engine formatter. */
  fixed?: boolean;
  className?: string;
}

const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl', xl: 'text-5xl md:text-6xl' } as const;

function fixedFormat(p: number): string {
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${p < 0 ? '-' : ''}£${pounds}.${(abs % 100).toString().padStart(2, '0')}`;
}

export function Money({ pence, strike, size = 'md', fixed, className }: MoneyProps) {
  const text = fixed ? fixedFormat(pence) : formatMoney(pence);
  return (
    <span
      className={cx('money tabular-nums', sizes[size], size === 'xl' && 'font-extrabold tracking-tight', strike && 'line-through opacity-60', className)}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {strike && <span className="sr-only">was </span>}
      {text}
    </span>
  );
}
