'use client';
import { useMemo, useState } from 'react';
import { formatMoney, gbp } from '@/lib/engine';
import type { Offer, OfferCategory, OfferContext } from '@/lib/offers';
import { matchOffers } from '@/lib/offers';
import { useAppSnapshot, useAppStore } from '@/lib/store';
import { MotionStyles } from '../change/motion';
import { dayLabel } from '../change/format';
import { Check, ExternalLink, Sparkles } from 'lucide-react';
import { IconBadge, WithIcon } from '@/components/ui/Value';
import { DealCompanyLogo, getOfferCompany } from './DealCompanyLogo';

/** London student defaults: area defaults to London so TfL, NeoTaste, Too Good To Go & Soho/Brick Lane deals appear. */
function readContext(): OfferContext {
  let ex: { city?: unknown; memberships?: unknown; diet?: unknown } = {};
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('mrmoney.onboardingExtras') : null;
    if (raw) ex = JSON.parse(raw) ?? {};
  } catch {
    ex = {};
  }
  const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  const city = typeof ex.city === 'string' && ex.city.trim() ? ex.city.trim() : 'London';
  return { area: city, memberships: strs(ex.memberships), diet: strs(ex.diet) };
}

const CATEGORY_LABELS: Record<'all' | OfferCategory, string> = {
  all: 'All London deals',
  'eating-out': 'Food & NeoTaste / TGTG',
  groceries: 'Groceries & OLIO',
  shopping: 'Clothes & shopping',
  transport: 'Tube & rail',
};

export function OffersPanel() {
  const snap = useAppSnapshot();
  const { store } = useAppStore();
  const state = snap.state;
  const today = snap.today;
  const [filter, setFilter] = useState<'all' | OfferCategory>('all');

  const ranked = useMemo(() => {
    if (!state?.plan) return [];
    const baseline: { category: OfferCategory; plannedPence: number }[] = [
      { category: 'eating-out', plannedPence: 1_000 },
      { category: 'groceries', plannedPence: 1_000 },
      { category: 'transport', plannedPence: 500 },
      { category: 'shopping', plannedPence: 500 },
    ];
    const planned = [
      ...baseline,
      ...state.plan.allocations
        .filter((a) => a.day >= today)
        .map((a) => ({ category: a.category, plannedPence: a.planned.pence })),
    ];
    return matchOffers(planned, readContext());
  }, [state, today]);

  const appliedDeals = state?.profile.appliedDeals ?? [];
  const appliedById = useMemo(() => new Map(appliedDeals.map((d) => [d.id, d])), [appliedDeals]);
  const totalSavedPence = useMemo(() => appliedDeals.reduce((s, d) => s + d.savedPence, 0), [appliedDeals]);

  const visible = useMemo(
    () => (filter === 'all' ? ranked : ranked.filter((r) => r.offer.category === filter)),
    [ranked, filter],
  );

  const handleApplyOffer = (offer: Offer) => {
    store.applyOffer({
      id: offer.id,
      title: offer.title,
      category: offer.category,
      percentOff: offer.percentOff,
      amountOffPence: offer.amountOffPence,
    });
  };

  const handleApplyAll = () => {
    store.applyAllOffers(ranked.map((r) => r.offer));
  };

  return (
    <div className="spc flex flex-col gap-3">
      <MotionStyles />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-text">
          <IconBadge icon="deal" tone="positive" size="xs" solid />
          {totalSavedPence > 0 ? (
            <span>
              <strong className="font-bold text-pos">{formatMoney(gbp(totalSavedPence))}</strong> saved on your calendar across{' '}
              <strong>{appliedDeals.length}</strong> applied student {appliedDeals.length === 1 ? 'deal' : 'deals'}
            </span>
          ) : (
            <span>London student deals — apply any deal to discount your calendar expenses</span>
          )}
        </div>
        {ranked.length > 0 && (
          <button
            type="button"
            onClick={handleApplyAll}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-grad-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-soft transition hover:opacity-95"
          >
            <Sparkles aria-hidden="true" size={13} />
            Apply best deals to calendar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter London student deals">
        {(Object.keys(CATEGORY_LABELS) as ('all' | OfferCategory)[]).map((cat) => {
          const active = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                active
                  ? 'bg-grad-primary shadow-soft'
                  : 'border border-line bg-surface text-muted hover:text-text'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {visible.length === 0 && <p className="text-sm text-muted">No deals match your plan yet.</p>}
      <ul className="flex flex-col gap-3">
        {visible.map(({ offer, eligibleNow }, i) => {
          const applied = appliedById.get(offer.id);
          const company = getOfferCompany(offer);
          return (
            <li
              key={offer.id}
              className="pop rounded-[24px] border border-line bg-surface p-4 shadow-soft transition-all hover:border-line-strong"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <DealCompanyLogo offer={offer} size={44} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs font-bold tracking-tight text-text border border-line">
                        {company.name}
                      </span>
                      {offer.percentOff !== undefined && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-grad-positive px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                          <IconBadge icon="deal" tone="onGradient" size="xs" className="!bg-transparent" />
                          {offer.percentOff}% off
                        </span>
                      )}
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {offer.area === 'London' ? 'London student' : 'UK student'} · {offer.category}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-base sm:text-lg font-bold text-text leading-snug">
                      {offer.title}
                    </h3>
                  </div>
                </div>

                <div className="shrink-0 sm:self-start">
                  {applied ? (
                    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-grad-positive-soft px-3.5 py-1.5 text-xs font-bold text-pos border border-pos/20">
                      <Check aria-hidden="true" size={14} />
                      Applied{applied.savedPence > 0 ? ` · ${formatMoney(gbp(applied.savedPence))}` : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApplyOffer(offer)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-grad-positive px-3.5 py-1.5 text-xs font-bold text-white shadow-soft transition hover:opacity-95 cursor-pointer"
                    >
                      <IconBadge icon="deal" tone="onGradient" size="xs" className="!bg-transparent" />
                      Apply deal
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-grad-positive-soft px-3 py-2 text-sm">
                <IconBadge icon="savings" tone="positive" size="sm" solid />
                <span>
                  <span className="text-muted">Student deal:</span>{' '}
                  <span className="font-bold text-pos">{offer.discountDescription}</span>
                </span>
              </p>
              <dl className="mt-3 space-y-1.5 text-sm text-muted">
                <div className="relative pl-7">
                  <dt className="inline font-semibold text-text">
                    <IconBadge icon="eligibility" tone="primary" size="xs" className="absolute left-0 top-0" />
                    Eligibility:{' '}
                  </dt>
                  <dd className="inline">
                    {offer.eligibility}
                    {offer.membership && !eligibleNow ? ` Needs ${offer.membership} membership.` : ''}
                  </dd>
                </div>
                <div className="relative pl-7">
                  <dt className="inline font-semibold text-text">
                    <IconBadge icon="conditions" tone="primary" size="xs" className="absolute left-0 top-0" />
                    Conditions:{' '}
                  </dt>
                  <dd className="inline">{offer.conditions}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs text-muted">
                <a
                  href={offer.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-accent underline underline-offset-4"
                >
                  <ExternalLink aria-hidden="true" size={13} />
                  <span>Official deal source</span>
                  <span className="sr-only"> for {offer.title} (opens in a new tab)</span>
                </a>
                <span>
                  <WithIcon icon="checked" tone="neutral" size={12}>Checked {dayLabel(offer.checked)}</WithIcon>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
