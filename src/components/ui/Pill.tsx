import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export type PillTone = 'neutral' | 'accent' | 'lime' | 'coral' | 'navy' | 'planned';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

const tones: Record<PillTone, string> = {
  neutral: 'bg-surface-2 text-text',
  accent: 'bg-accent text-accent-ink',
  lime: 'bg-lime-fill text-[#0F1024]',
  coral: 'bg-coral text-white',
  navy: 'bg-navy text-white',
  planned: 'border border-dashed border-line bg-transparent text-muted',
};

export function Pill({ tone = 'neutral', className, ...rest }: PillProps) {
  return (
    <span
      className={cx('inline-flex min-h-6 items-center gap-1 rounded-full px-3 text-xs font-semibold', tones[tone], className)}
      {...rest}
    />
  );
}
