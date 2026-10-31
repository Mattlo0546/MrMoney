'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, RotateCcw, Tag } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/reui/dropdown-menu';
import { useAppSnapshot } from '@/lib/store';
import { MotionStyles } from '@/components/plan/change/motion';
import { ChatCard } from './ChatCards';
import { addOpening, newChat, sendMessage, startDemoLocal, useChat } from './chatStore';
import { PHASE_LABEL } from './model';

const SETUP_CHIPS = ['£1,200 a month, rent £700, brokie 🍜', 'Try a demo student'];
const PLAN_CHIPS = [
  { label: 'I spent £…', stub: 'I spent £' },
  { label: 'Can I spend £…', stub: 'Can I spend £' },
  { label: 'Best savings rate?', send: 'Find me the best easy-access savings rate' },
];

function Dots() {
  return (
    <span aria-hidden className="flex gap-1">
      <span className="dot" /><span className="dot" /><span className="dot" />
    </span>
  );
}

function Bubble({ role, children, testId = 'chat-message' }: { role: 'user' | 'assistant'; children: ReactNode; testId?: string }) {
  return role === 'user' ? (
    <div className="pop flex justify-end" data-testid={testId} data-role="user">
      <p className="max-w-[86%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-(--c-accent) px-4 py-3 text-[15px] font-semibold leading-snug text-(--c-accent-ink)">{children}</p>
    </div>
  ) : (
    <div className="pop flex justify-start" data-testid={testId} data-role="assistant">
      <p className="max-w-[92%] whitespace-pre-wrap rounded-[20px] rounded-bl-md bg-(--c-surface-2) px-4 py-3 text-[15px] leading-snug">{children}</p>
    </div>
  );
}

export interface ChatPanelProps {
  /** 'welcome': first visit, centred and full height. 'panel': inside the plan layout. */
  variant: 'welcome' | 'panel';
  /** Extra header items (e.g. tabs). */
  header?: ReactNode;
  onShowDeals?: () => void;
  autoFocus?: boolean;
}

export function ChatPanel({ variant, header, onShowDeals, autoFocus }: ChatPanelProps) {
  const chat = useChat();
  const snap = useAppSnapshot();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const welcome = variant === 'welcome';
  const hasPlan = !!snap.state;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Keep the newest message in view.
  const last = chat.messages[chat.messages.length - 1];
  const lastKey = `${chat.messages.length}:${last?.cards?.length ?? 0}:${last?.text.length ?? 0}:${chat.phase}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
  }, [lastKey, reduced]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const opening = hasPlan
    ? 'Tell me what changed: "I spent £12 on lunch", "Can I spend £40 on Saturday?", or ask me to find a better savings rate.'
    : "Hey! Three questions and I'll do all the maths. First up: how much money comes in each month?";
  const send = (value: string) => {
    const v = value.trim();
    if (!v || chat.busy) return;
    if (chat.messages.length === 0) addOpening(opening);
    if (/^try (a )?demo( student)?$/i.test(v)) startDemoLocal(v);
    else void sendMessage(v);
    setText('');
    inputRef.current?.focus({ preventScroll: true });
  };
  const prefill = (t: string) => {
    setText(t);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(t.length, t.length);
    });
  };

  const status = chat.busy ? chat.statusLabel || PHASE_LABEL[chat.phase] || 'Thinking…' : '';
  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className={`spc flex min-h-0 flex-1 flex-col ${welcome ? 'mx-auto w-full max-w-[720px]' : ''}`}>
      <MotionStyles />
      {/* Screen-reader announcements: status and the latest reply. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status || (lastAssistant && !chat.busy ? lastAssistant.text : '')}
      </div>

      {!welcome && (
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">{header}</div>
          {snap.demoActive && <span data-testid="demo-badge" className="sr-only">Demo mode</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Chat menu" className="grid size-11 shrink-0 place-items-center rounded-full bg-(--c-surface-2) text-(--c-text)">
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => newChat()} disabled={chat.busy}>
                <RotateCcw size={16} aria-hidden /> New chat
              </DropdownMenuItem>
              {onShowDeals && (
                <DropdownMenuItem onSelect={onShowDeals}>
                  <Tag size={16} aria-hidden /> Deals
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div role="log" aria-label="Conversation" className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto ${welcome ? 'px-1 pb-4' : 'pr-1'}`}>
        {welcome && chat.messages.length === 0 && (
          <div className="pop mx-auto mb-2 mt-4 w-full max-w-[280px] overflow-hidden rounded-[24px] bg-[#E6E8FF]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/illustrations/welcome.webp" alt="" className="h-auto w-full" />
          </div>
        )}
        {welcome && chat.messages.length === 0 && (
          <h1 className="text-center font-display text-3xl font-extrabold leading-tight lg:text-4xl">Know what you can spend today.</h1>
        )}
        {chat.messages.length === 0 && <Bubble role="assistant" testId="chat-opening">{opening}</Bubble>}
        {chat.messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            {m.text && <Bubble role={m.role}>{m.text}</Bubble>}
            {!m.text && m.role === 'assistant' && (m.cards?.length ?? 0) > 0 && <span data-testid="chat-message" data-role="assistant" className="sr-only">Assistant</span>}
            {m.cards?.map((c) => (
              <ChatCard key={c.id} c={c} busy={chat.busy} messageText={m.text} onReply={send} onPrefill={prefill} />
            ))}
          </div>
        ))}
        {status && (
          <p data-testid="chat-status" role="status" className="flex items-center gap-2 px-1 text-sm font-semibold text-(--c-muted)">
            <Dots /> {status}
          </p>
        )}
        {chat.offline && !chat.busy && (
          <p className="px-1 text-xs font-semibold text-(--c-muted)">Offline mode: simple reader and sample offers.</p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className={`mt-3 flex flex-col gap-2 ${welcome ? 'sticky bottom-0 bg-(--c-bg) pb-4 pt-2' : ''}`}
        aria-label="Message MrMoney"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {!text && !chat.busy && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Suggestions">
            {hasPlan
              ? PLAN_CHIPS.map((c) => (
                  <button key={c.label} type="button" onClick={() => (c.send ? send(c.send) : prefill(c.stub!))}
                    className="spring min-h-11 shrink-0 rounded-full border border-(--c-line) bg-(--c-surface-2) px-4 text-sm font-semibold">{c.label}</button>
                ))
              : SETUP_CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => send(c)}
                    className={`spring min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${c.startsWith('Try') ? 'border border-(--c-lime) text-(--c-lime)' : 'bg-(--c-surface-2) border border-(--c-line)'}`}>{c}</button>
                ))}
          </div>
        )}
        <div className={`flex items-end gap-2 rounded-[20px] border border-(--c-line) bg-(--c-surface-2) py-2 pl-4 pr-2 focus-within:border-(--c-accent) ${welcome ? 'min-h-16' : ''}`}>
          <label htmlFor={id} className="sr-only">Message</label>
          <textarea
            id={id}
            ref={inputRef}
            data-testid="chat-input"
            style={{ outline: 'none' }}
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={hasPlan ? 'Tell me what changed…' : 'e.g. £1,200 a month, rent £700, living like a brokie'}
            className={`max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 focus-visible:outline-none text-(--c-text) outline-none placeholder:text-(--c-muted) ${welcome ? 'text-lg' : 'text-base'}`}
          />
          <button
            type="submit"
            data-testid="chat-send"
            disabled={chat.busy || !text.trim()}
            aria-label={chat.busy ? 'Working…' : 'Send'}
            className="spring grid size-11 shrink-0 place-items-center rounded-full bg-(--c-lime-fill) text-[#0B0C1F] disabled:opacity-40"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="sr-only">Enter sends. Shift+Enter adds a new line.</p>
      </form>
    </div>
  );
}
