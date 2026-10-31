'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MoreHorizontal, Palette, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/reui/dropdown-menu';
import { getAppStore } from '@/lib/store';
import { applyTheme, readTheme, type Theme } from './theme';

/**
 * App menu built from the ReUI c-dropdown-menu-8 composition (groups, labels, submenu with radio items,
 * destructive item). Trigger uses asChild because the installed primitive is Radix.
 */
export function AppMenu() {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>('dark');

  function onTheme(v: string) {
    const t: Theme = v === 'light' ? 'light' : 'dark';
    setTheme(t);
    applyTheme(t);
  }

  function onReset() {
    if (!window.confirm('Reset StudentPlan? This clears your plan and starts again.')) return;
    getAppStore().reset();
    router.replace('/onboarding');
  }

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) setTheme(readTheme()); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="App menu"
          className="grid size-11 place-items-center rounded-full bg-surface-2 text-text hover:bg-line"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette size={16} aria-hidden="true" />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={onTheme}>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onReset}>
          <RotateCcw size={16} aria-hidden="true" />
          Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
