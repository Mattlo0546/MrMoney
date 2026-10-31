'use client';
import { useId, useRef, useState } from 'react';
import { MotionStyles } from '../change/motion';
import { submitText, useChangeView } from '../change/changeState';

const EXAMPLES = [
  'I need to spend £35 on a shower filter today',
  'Can I spend £20 on dinner tomorrow?',
  'I received an extra £200',
];

export function Composer({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState('');
  const view = useChangeView();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const pending = view.status === 'pending';

  async function send(value: string) {
    if (pending || !value.trim()) return;
    const clear = await submitText(value);
    if (clear) setText('');
  }

  return (
    <form
      className="spc flex flex-col gap-3"
      aria-label="Tell me what changed"
      onSubmit={(e) => {
        e.preventDefault();
        void send(text);
      }}
    >
      <MotionStyles />
      <div className="flex items-center gap-2 rounded-[16px] border border-(--c-line) bg-(--c-surface-2) py-1.5 pl-4 pr-1.5 focus-within:border-(--c-accent)">
        <label htmlFor={id} className="sr-only">
          Tell me what changed
        </label>
        <input
          id={id}
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell me what changed…"
          maxLength={500}
          autoComplete="off"
          disabled={pending}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-(--c-text) outline-none placeholder:text-(--c-muted)"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          aria-label={pending ? 'Reading your message' : 'Send'}
          className="spring grid size-11 shrink-0 place-items-center rounded-full bg-(--c-accent) text-(--c-accent-ink) disabled:opacity-40"
        >
          {pending ? (
            <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      {pending && (
        <p className="flex items-center gap-2 text-sm text-(--c-muted)" role="status">
          <span aria-hidden className="flex gap-1">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
          Reading that…
        </p>
      )}
      {!text && !pending && (
        <div className={compact ? '-mx-1 flex gap-2 overflow-x-auto px-1 pb-1' : 'flex flex-wrap gap-2'} aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                inputRef.current?.focus();
              }}
              className="spring min-h-11 shrink-0 rounded-full border border-(--c-line) bg-(--c-surface-2) px-4 text-left text-sm text-(--c-text)"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
