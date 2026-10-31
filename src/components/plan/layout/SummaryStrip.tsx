import { formatMoney, formatShortDate } from '@/lib/engine';
import type { ISODate, Summary } from '@/lib/engine';
import { IconBadge, Stat, WithIcon } from '@/components/ui/Value';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function SummaryStrip({ s, today, nextIncome, todayPlanned = 0 }: {
  s: Summary; today: ISODate; nextIncome: { date: ISODate; pence: number } | null;
  /** Money set aside for today's spending-plan items (so "Left today £0" reads as "all planned", not "broke"). */
  todayPlanned?: number;
}) {
  const spent = s.todaySpent.pence;
  return (
    <section aria-label="Summary" className="grid gap-2.5 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div className="relative flex flex-col justify-between gap-2 overflow-hidden rounded-2xl bg-grad-hero p-3.5 shadow-glow lg:p-4">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between gap-2 text-xs font-bold">
          <p>Left today</p>
          <p className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">
            {spent > 0
              ? <WithIcon icon="spent" tone="onGradient" size={12}>{formatMoney(spent)} spent</WithIcon>
              : todayPlanned > 0 && s.todayRemaining.pence === 0
                ? <WithIcon icon="planned" tone="onGradient" size={12}>{formatMoney(todayPlanned)} planned today</WithIcon>
                : <WithIcon icon="date" tone="onGradient" size={12}>{DAY.format(new Date(`${today}T00:00:00Z`))}</WithIcon>}
          </p>
        </div>
        <div className="relative flex items-center gap-2.5">
          <IconBadge icon="allowance" tone="onGradient" size="md" />
          <p className="font-display text-4xl font-extrabold leading-none tracking-tight tabular-nums lg:text-5xl" data-testid="allowance">
            {formatMoney(s.todayRemaining)}
          </p>
        </div>
        <div className="relative flex items-center justify-between gap-2 border-t border-white/20 pt-2 text-xs font-bold">
          <p>Flexible left</p>
          <WithIcon icon="flexible" tone="onGradient" size={14} className="tabular-nums">{formatMoney(s.flexibleRemaining)}</WithIcon>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2.5">
        <Stat icon="balance" tone="primary" label="Funds left" value={formatMoney(s.balance.pence)}>
          {nextIncome && (
            <dd className="text-[11px] font-bold text-pos">
              <WithIcon icon="income" tone="positive" size={11}>+{formatMoney(nextIncome.pence)} on {formatShortDate(nextIncome.date)}</WithIcon>
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
