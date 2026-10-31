import { formatMoney, formatShortDate } from '@/lib/engine';
import type { ISODate, Summary } from '@/lib/engine';
import { PinIcon } from '../calendar/shared';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function SummaryStrip({ s, today, nextIncome }: { s: Summary; today: ISODate; nextIncome: { date: ISODate; pence: number } | null }) {
  const spent = s.todaySpent.pence;
  return (
    <section aria-label="Summary" className="grid gap-3 lg:grid-cols-[minmax(300px,380px)_1fr]">
      <div className="flex flex-col justify-between gap-3 rounded-3xl bg-[var(--accent)] p-5 text-[var(--accent-ink)] lg:min-h-[196px] lg:p-6">
        <div className="flex items-baseline justify-between gap-2 text-sm font-bold">
          <p>Left today</p>
          <p className="tabular-nums">{spent > 0 ? `${formatMoney(spent)} spent` : DAY.format(new Date(`${today}T00:00:00Z`))}</p>
        </div>
        <p className="font-display text-[56px] font-extrabold leading-none tabular-nums lg:text-[72px]" data-testid="allowance">
          {formatMoney(s.todayRemaining)}
        </p>
        <div className="flex items-baseline justify-between gap-2 text-sm font-bold">
          <p>Flexible left</p>
          <p className="tabular-nums">{formatMoney(s.flexibleRemaining)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col justify-center gap-1 rounded-3xl bg-[var(--surface)] p-4">
          <dt className="text-sm font-semibold text-[var(--muted)]">Funds left</dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(s.balance.pence)}</dd>
          {nextIncome && <dd className="text-xs font-bold text-[var(--lime)]">+{formatMoney(nextIncome.pence)} on {formatShortDate(nextIncome.date)}</dd>}
        </div>
        <div className="flex flex-col justify-center gap-1 rounded-3xl bg-[var(--surface)] p-4">
          <dt className="flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)]"><PinIcon />For bills</dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(s.reservedForCommitments.pence)}</dd>
        </div>
        <div className="flex flex-col justify-center gap-1 rounded-3xl bg-[var(--surface)] p-4">
          <dt className="flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)]"><LockIcon />Reserve</dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(s.reserve.pence)}</dd>
        </div>
        <div className="flex flex-col justify-center gap-1 rounded-3xl bg-[var(--surface)] p-4">
          <dt className="text-sm font-semibold text-[var(--muted)]">Savings</dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(s.plannedSavings.pence)}</dd>
        </div>
      </dl>
    </section>
  );
}
