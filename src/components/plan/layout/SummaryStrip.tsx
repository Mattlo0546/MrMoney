import { formatMoney, formatShortDate } from '@/lib/engine';
import type { ISODate, Summary } from '@/lib/engine';
import { IconBadge, Stat, WithIcon } from '@/components/ui/Value';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function SummaryStrip({ s, today, nextIncome }: { s: Summary; today: ISODate; nextIncome: { date: ISODate; pence: number } | null }) {
  const spent = s.todaySpent.pence;
  return (
    <section aria-label="Summary" className="grid gap-3 lg:grid-cols-[minmax(300px,380px)_1fr]">
      <div className="relative flex flex-col justify-between gap-3 overflow-hidden rounded-3xl bg-grad-hero p-5 shadow-glow lg:min-h-[196px] lg:p-6">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between gap-2 text-sm font-bold">
          <p className="flex items-center gap-2"><IconBadge icon="allowance" tone="onGradient" size="sm" />Left today</p>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 tabular-nums">
            {spent > 0
              ? <WithIcon icon="spent" tone="onGradient" size={13}>{formatMoney(spent)} spent</WithIcon>
              : <WithIcon icon="date" tone="onGradient" size={13}>{DAY.format(new Date(`${today}T00:00:00Z`))}</WithIcon>}
          </p>
        </div>
        <p className="relative font-display text-[56px] font-extrabold leading-none tracking-tight tabular-nums lg:text-[72px]" data-testid="allowance">
          {formatMoney(s.todayRemaining)}
        </p>
        <div className="relative flex items-center justify-between gap-2 border-t border-white/20 pt-3 text-sm font-bold">
          <p className="flex items-center gap-2"><IconBadge icon="flexible" tone="onGradient" size="xs" />Flexible left</p>
          <p className="tabular-nums">{formatMoney(s.flexibleRemaining)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Stat icon="balance" tone="primary" label="Funds left" value={formatMoney(s.balance.pence)}>
          {nextIncome && (
            <dd className="text-xs font-bold text-pos">
              <WithIcon icon="income" tone="positive" size={13}>+{formatMoney(nextIncome.pence)} on {formatShortDate(nextIncome.date)}</WithIcon>
            </dd>
          )}
        </Stat>
        <Stat icon="bills" tone="warning" label="For bills" value={formatMoney(s.reservedForCommitments.pence)} />
        <Stat icon="reserve" tone="primary" label="Reserve" value={formatMoney(s.reserve.pence)} />
        <Stat icon="savings" tone="positive" label="Savings" value={formatMoney(s.plannedSavings.pence)} />
      </dl>
    </section>
  );
}
