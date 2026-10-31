import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `surface` (default) or raised `surface-2`. */
  tone?: 'surface' | 'raised';
  /** Dashed outline for planned (not yet spent) content. */
  planned?: boolean;
}

export function Card({ tone = 'surface', planned, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-[24px] p-5',
        tone === 'surface' ? 'bg-surface' : 'bg-surface-2',
        planned ? 'border border-dashed border-line' : 'border border-transparent',
        className,
      )}
      {...rest}
    />
  );
}
