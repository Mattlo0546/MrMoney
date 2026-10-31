'use client';
import { useRouter } from 'next/navigation';
import { PlayCircle, RotateCcw, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/reui/dropdown-menu';
import { resetApp, type ResetMode } from './reset';

export function ResetButton() {
  const router = useRouter();

  function onAction(mode: ResetMode) {
    resetApp(mode);
    router.replace('/plan');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Reset app"
          title="Reset app"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-bold text-muted shadow-soft transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-text lg:min-h-11 lg:px-3.5 lg:text-sm"
        >
          <RotateCcw size={15} aria-hidden="true" className="shrink-0 text-muted" />
          <span>Reset</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold text-muted">Reset MrMoney</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => onAction('onboarding')}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-2.5 py-2"
        >
          <span className="flex items-center gap-2 font-bold text-text">
            <Sparkles size={15} aria-hidden="true" className="text-accent" />
            Start onboarding again
          </span>
          <span className="text-xs text-muted">Clear all data and answer setup questions</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          onSelect={() => onAction('demo')}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-2.5 py-2"
        >
          <span className="flex items-center gap-2 font-bold text-text">
            <PlayCircle size={15} aria-hidden="true" className="text-pos" />
            Reset for demo
          </span>
          <span className="text-xs text-muted">Load demo student with £3,900 plan</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
