'use client';
import type { ReactNode } from 'react';

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="ob-field">
      <label className="ob-label" htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="ob-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="ob-err" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function MoneyInput({ id, label, value, onChange, error, hint, big }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; big?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className={`ob-money${big ? ' big' : ''}`}>
        <span aria-hidden="true">£</span>
        <input id={id} className={`ob-input${big ? ' big' : ''}`} inputMode="decimal" autoComplete="off" value={value}
          onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} />
      </div>
    </Field>
  );
}

export function TextInput({ id, label, value, onChange, error, hint, type = 'text', inputMode, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string;
  type?: 'text' | 'date'; inputMode?: 'numeric'; placeholder?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input id={id} type={type} className="ob-input" inputMode={inputMode} value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} />
    </Field>
  );
}

export function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ob-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Choice<T extends string>({ name, legend, value, options, onChange }: {
  name: string; legend: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="ob-toggle">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="ob-seg-opt">
          <input type="radio" name={name} id={`${name}-${o.value}`} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
