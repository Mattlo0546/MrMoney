'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ChartLine, Landmark, SlidersHorizontal, Wallet } from 'lucide-react';
import { useAppSnapshot } from '@/lib/store';
import { AppMenu } from './AppMenu';

const LINKS = [
  { href: '/plan', label: 'Plan', icon: Wallet },
  { href: '/projections', label: 'Projections', icon: ChartLine },
  { href: '/money', label: 'Money', icon: Landmark },
  { href: '/settings', label: 'Settings', icon: SlidersHorizontal },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function demoLabels(iso: string): { full: string; short: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const long = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  return { full: `Demo · ${long.replace(',', '')}`, short: `Demo · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
}

export function TopNav() {
  const pathname = usePathname();
  const { hydrated, state, demoActive, demoDate } = useAppSnapshot();
  const hasPlan = hydrated && !!state;
  const labels = demoActive && demoDate ? demoLabels(demoDate) : null;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-[1400px] items-center gap-2 px-4 lg:gap-4 lg:px-6">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-lg font-extrabold tracking-tight lg:text-xl">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-[10px] bg-grad-primary shadow-glow">
            <CalendarDays size={18} />
          </span>
          <span>Student<span className="text-grad-primary">Plan</span></span>
        </Link>
        {hasPlan && (
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition-colors ${
                    active ? 'bg-grad-primary shadow-glow' : 'text-muted hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <l.icon aria-hidden="true" size={16} strokeWidth={2.3} />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {hasPlan && labels && (
            <span
              title="Demo mode"
              className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-pos/25 bg-pos-soft px-3 text-xs font-bold text-pos"
            >
              <CalendarDays aria-hidden="true" size={14} strokeWidth={2.3} className="shrink-0" />
              <span className="lg:hidden">{labels.short}</span>
              <span className="hidden lg:inline">{labels.full}</span>
            </span>
          )}
          {hasPlan && <AppMenu />}
        </div>
      </div>
      {hasPlan && (
        <nav aria-label="Main" className="px-4 pb-3 lg:hidden">
          <div className="mx-auto grid max-w-[1400px] grid-cols-4 gap-1 rounded-full border border-line bg-surface-2 p-1">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold ${
                    active ? 'bg-grad-primary shadow-glow' : 'text-muted'
                  }`}
                >
                  <l.icon aria-hidden="true" size={15} strokeWidth={2.3} />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
