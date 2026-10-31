'use client';
import type { ComponentProps, InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { IconBadge, iconFor, type Tone, type ValueKind } from '@/components/ui/Value';

export function PageFrame({
  title,
  icon,
  children,
  maxWidth = 'max-w-[1400px]',
  className = '',
}: {
  title: string;
  icon?: ValueKind | LucideIcon;
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className={`mx-auto w-full ${maxWidth} px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8`}>
        <h1 className="mb-6 flex items-center gap-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {icon && <IconBadge icon={icon} tone="primary" size="lg" solid />}
          {title}
        </h1>
        <div className={`flex flex-col gap-6 ${className}`}>{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, hint, icon, children, tone }: { title?: string; hint?: string; icon?: ValueKind | LucideIcon; children: ReactNode; tone?: 'danger' }) {
  return (
    <section
      className={`rounded-[24px] border bg-surface p-5 shadow-soft sm:p-6 ${tone === 'danger' ? 'border-neg/30 bg-grad-negative-soft' : 'border-line'}`}
    >
      {title && (
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          {icon && <IconBadge icon={icon} tone={tone === 'danger' ? 'negative' : 'primary'} size="sm" />}
          {title}
        </h2>
      )}
      {hint && <p className={`mt-1 text-sm text-muted ${icon ? 'sm:pl-[38px]' : ''}`}>{hint}</p>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

/**
 * Labelled input. `icon` shows the value's meaning inside the field (icon-per-value rule);
 * when omitted, a £ prefix gets a pound icon and a % suffix gets a percent icon.
 */
export function Field({
  label, error, hint, id, prefix, suffix, icon, iconTone = 'primary', ...input
}: { label: string; error?: string; hint?: string; id: string; prefix?: string; suffix?: string; icon?: ValueKind | LucideIcon; iconTone?: Tone } & InputHTMLAttributes<HTMLInputElement>) {
  const glyph: ValueKind | LucideIcon | undefined = icon ?? (prefix === '£' ? 'pounds' : suffix === '%' ? 'percent' : input.type === 'date' ? 'date' : undefined);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-muted">{label}</label>
      <div
        className={`flex min-h-12 items-center gap-2 rounded-[16px] border bg-surface pl-2 pr-4 shadow-soft transition-colors focus-within:border-line-strong ${error ? 'border-neg' : 'border-line'}`}
      >
        {glyph ? <IconBadge icon={glyph} tone={error ? 'negative' : iconTone} size="sm" /> : <span className="w-2" aria-hidden="true" />}
        {prefix && <span className="font-semibold text-muted">{prefix}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="min-h-11 w-full min-w-0 bg-transparent text-base font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted disabled:opacity-60"
          {...input}
        />
        {suffix && <span className="font-semibold text-muted">{suffix}</span>}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="text-sm font-semibold text-neg">{error}</p>}
      {!error && hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Btn({
  variant = 'primary', className = '', ...p
}: { variant?: 'primary' | 'ghost' | 'danger' } & ComponentProps<'button'>) {
  const v =
    variant === 'primary'
      ? 'bg-grad-primary shadow-glow hover:brightness-110'
      : variant === 'danger'
        ? 'bg-grad-negative hover:brightness-110'
        : 'border border-line bg-surface text-text shadow-soft hover:bg-surface-2';
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition-[transform,filter] active:scale-95 disabled:opacity-50 outline-none ${v} ${className}`}
      {...p}
    />
  );
}

/** Pill radio group (gradient when checked). */
export function Choice<T extends string>({ label, value, options, onPick, cols = 2 }: {
  label: string; value: T; options: { id: T; label: string; icon?: ValueKind | LucideIcon }[]; onPick: (v: T) => void; cols?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-full border border-line bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon ? iconFor(o.icon) : null;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(o.id)}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold transition-[transform,color] active:scale-95 sm:text-base ${on ? 'bg-grad-primary shadow-glow' : 'text-muted hover:text-text'}`}>
            {Icon && <Icon aria-hidden="true" size={16} strokeWidth={2.3} className="shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pounds text -> pence; null when not a valid non-negative amount. Empty -> 0 when allowEmpty. */
export function parsePounds(raw: string, allowEmpty = true): number | null {
  const t = raw.trim().replace(/^£/, '').replace(/,/g, '');
  if (t === '') return allowEmpty ? 0 : null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}
export const penceToInput = (p: number): string => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));
