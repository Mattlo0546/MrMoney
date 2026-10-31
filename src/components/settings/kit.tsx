'use client';
import type { ComponentProps, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

/** Local tokens: read the shell's CSS variables, with the contract's dark values as fallback. */
export const TOKENS = {
  '--p-bg': 'var(--bg, #0B0C1F)',
  '--p-surface': 'var(--surface, #16183A)',
  '--p-surface2': 'var(--surface-2, #20235A)',
  '--p-line': 'var(--line, #2C3070)',
  '--p-text': 'var(--text, #F5F5FA)',
  '--p-muted': 'var(--muted, #A3A6D1)',
  '--p-accent': 'var(--accent, #3D5AFE)',
  '--p-accent-ink': 'var(--accent-ink, #FFFFFF)',
  '--p-lime': 'var(--lime, #C8F53C)',
  '--p-coral': 'var(--coral, #FF5A5F)',
} as CSSProperties;

export function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={TOKENS} className="min-h-dvh bg-[var(--p-bg)] text-[var(--p-text)]">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-6 font-[family-name:var(--font-display,inherit)] text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </main>
  );
}

export function Card({ title, hint, children, tone }: { title?: string; hint?: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <section
      className={`rounded-[24px] border bg-[var(--p-surface)] p-5 sm:p-6 ${tone === 'danger' ? 'border-[var(--p-coral)]' : 'border-[var(--p-line)]'}`}
    >
      {title && <h2 className="text-lg font-bold">{title}</h2>}
      {hint && <p className="mt-1 text-sm text-[var(--p-muted)]">{hint}</p>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function Field({
  label, error, hint, id, prefix, suffix, ...input
}: { label: string; error?: string; hint?: string; id: string; prefix?: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--p-muted)]">{label}</label>
      <div
        className={`flex min-h-12 items-center gap-1 rounded-[16px] border bg-[var(--p-surface2)] px-4 focus-within:ring-2 focus-within:ring-[var(--p-accent)] ${error ? 'border-[var(--p-coral)]' : 'border-[var(--p-line)]'}`}
      >
        {prefix && <span className="text-[var(--p-muted)]">{prefix}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="min-h-11 w-full min-w-0 bg-transparent text-base tabular-nums outline-none placeholder:text-[var(--p-muted)] disabled:opacity-60"
          {...input}
        />
        {suffix && <span className="text-[var(--p-muted)]">{suffix}</span>}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="text-sm font-semibold text-[var(--p-coral)]">{error}</p>}
      {!error && hint && <p className="text-xs text-[var(--p-muted)]">{hint}</p>}
    </div>
  );
}

export function Btn({
  variant = 'primary', className = '', ...p
}: { variant?: 'primary' | 'ghost' | 'danger' } & ComponentProps<'button'>) {
  const v =
    variant === 'primary'
      ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
      : variant === 'danger'
        ? 'bg-[var(--p-coral)] text-white'
        : 'border border-[var(--p-line)] bg-transparent text-[var(--p-text)]';
  return (
    <button
      type="button"
      className={`min-h-11 rounded-full px-5 text-base font-bold transition-transform active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p-accent)] ${v} ${className}`}
      {...p}
    />
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
