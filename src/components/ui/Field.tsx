import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';

export interface FieldProps {
  label: string;
  /** A single input/select/textarea element; id and aria attributes are wired for you. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  error?: string;
  hint?: ReactNode;
  className?: string;
}

export function Field({ label, children, error, hint, className }: FieldProps) {
  const uid = useId();
  const id = children.props.id ?? `f${uid}`;
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-text">{label}</label>
      {isValidElement(children) &&
        cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={hintId} className="text-sm text-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-sm font-semibold text-neg">{error}</p>}
    </div>
  );
}

/** Shared input styling for text/number/select controls. */
export const inputClass =
  'min-h-11 w-full rounded-[16px] border border-line bg-surface px-4 text-[16px] text-text shadow-soft placeholder:text-muted focus:border-accent aria-[invalid=true]:border-neg';
