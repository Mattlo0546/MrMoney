import { formatMoney } from '@/lib/engine';
import type { Summary } from '@/lib/engine';

export function SummaryStrip({ s }: { s: Summary }) {
  const small: [string, number][] = [
    ['Funds left', s.balance.pence],
    ['For commitments', s.reservedForCommitments.pence],
    ['Minimum reserve', s.reserve.pence],
    ['Planned savings', s.plannedSavings.pence],
    ['Flexible left', s.flexibleRemaining.pence],
  ];
  return (
    <section aria-label="Summary" className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div className="rounded-3xl bg-[var(--accent)] p-5 text-[var(--accent-ink)]">
        <p className="text-sm font-bold opacity-90">Today&apos;s allowance</p>
        <p className="font-display text-[56px] font-extrabold leading-none tabular-nums" data-testid="allowance">{formatMoney(s.todayAllowance)}</p>
        <p className="mt-2 text-sm font-semibold tabular-nums">{formatMoney(s.todayRemaining)} left today</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {small.map(([k, v]) => (
          <div key={k} className="flex flex-col justify-center rounded-3xl bg-[var(--surface)] p-4">
            <dt className="text-xs font-bold text-[var(--muted)]">{k}</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
