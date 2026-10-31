import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Stretch to container width. */
  block?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  secondary: 'bg-surface-2 text-text border border-line hover:border-muted',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-coral text-white hover:brightness-110',
};

export function Button({ variant = 'primary', loading = false, block, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition-[transform,filter,background-color] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={18} className="text-current" />}
      {children}
    </button>
  );
}
