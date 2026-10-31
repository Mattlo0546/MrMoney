import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export type PillTone = 'neutral' | 'accent' | 'lime' | 'coral' | 'navy' | 'planned' | 'positive' | 'warning' | 'negative';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

const tones: Record<PillTone, string> = {
  neutral: 'bg-surface-2 text-text',
  accent: 'bg-grad-primary',
  lime: 'bg-grad-positive',
  positive: 'bg-grad-positive',
  coral: 'bg-grad-negative',
  negative: 'bg-grad-negative',
  navy: 'bg-grad-warning',
  warning: 'bg-grad-warning',
  planned: 'border border-dashed border-line-strong bg-transparent text-muted',
};

export function Pill({ tone = 'neutral', className, ...rest }: PillProps) {
  return (
    <span
      className={cx('inline-flex min-h-6 items-center gap-1 rounded-full px-3 text-xs font-semibold', tones[tone], className)}
      {...rest}
    />
  );
}
