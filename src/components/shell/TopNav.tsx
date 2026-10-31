'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppSnapshot } from '@/lib/store';
import { Pill } from '@/components/ui/Pill';
import { AppMenu } from './AppMenu';

const LINKS = [
  { href: '/plan', label: 'Plan' },
  { href: '/projections', label: 'Projections' },
  { href: '/settings', label: 'Settings' },
];

function demoLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  return `Demo · ${s.replace(',', '')}`;
}

export function TopNav() {
  const pathname = usePathname();
  const { demoActive, demoDate } = useAppSnapshot();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[1400px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
          Student<span className="text-lime">Plan</span>
        </Link>
        <nav aria-label="Main" className="ml-1 flex items-center gap-0.5 sm:ml-4 sm:gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-2.5 text-[13px] font-bold sm:px-4 sm:text-[15px] ${
                  active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {demoActive && demoDate && (
            <Pill tone="lime" className="hidden sm:inline-flex" title="Demo mode">{demoLabel(demoDate)}</Pill>
          )}
          {demoActive && demoDate && (
            <Pill tone="lime" className="sm:hidden">Demo</Pill>
          )}
          <AppMenu />
        </div>
      </div>
    </header>
  );
}
