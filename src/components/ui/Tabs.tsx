'use client';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled active tab id. */
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs({ tabs, value, onChange, className, 'aria-label': ariaLabel }: TabsProps) {
  const uid = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value));

  function onKey(e: KeyboardEvent) {
    let n = idx;
    if (e.key === 'ArrowRight') n = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
        {tabs.map((t, i) => {
          const active = i === idx;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cx(
                'min-h-11 flex-1 rounded-full px-4 text-sm font-bold transition-colors',
                active ? 'bg-grad-primary shadow-glow' : 'text-muted hover:text-text',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${uid}-panel-${t.id}`}
          aria-labelledby={`${uid}-tab-${t.id}`}
          hidden={i !== idx}
          tabIndex={0}
          className="mt-4 rounded-[16px]"
        >
          {i === idx ? t.content : null}
        </div>
      ))}
    </div>
  );
}
