'use client';
import { useMemo } from 'react';
import type { OfferContext } from '@/lib/offers';
import { matchOffers } from '@/lib/offers';
import { useAppSnapshot } from '@/lib/store';
import { MotionStyles } from '../change/motion';
import { dayLabel } from '../change/format';
import { ExternalLink, Info } from 'lucide-react';
import { IconBadge, WithIcon } from '@/components/ui/Value';

/** G1: onboarding extras from localStorage (never throws). Demo students default to London. */
function readContext(demo: boolean): OfferContext {
  let ex: { city?: unknown; memberships?: unknown; diet?: unknown } = {};
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('studentplan.onboardingExtras') : null;
    if (raw) ex = JSON.parse(raw) ?? {};
  } catch {
    ex = {};
  }
  const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  const city = typeof ex.city === 'string' && ex.city.trim() ? ex.city.trim() : demo ? 'London' : undefined;
  return { area: city, memberships: strs(ex.memberships), diet: strs(ex.diet) };
}

export function OffersPanel() {
  const snap = useAppSnapshot();
  const state = snap.state;
  const today = snap.today;
  const ranked = useMemo(() => {
    if (!state?.plan) return [];
    // matchOffers sums planned money per category itself; we only pass upcoming allocations.
    const planned = state.plan.allocations
      .filter((a) => a.day >= today)
      .map((a) => ({ category: a.category, plannedPence: a.planned.pence }));
    return matchOffers(planned, readContext(snap.demoActive));
  }, [state, today, snap.demoActive]);

  return (
    <div className="spc flex flex-col gap-3">
      <MotionStyles />
      <p className="flex gap-2 text-sm text-(--c-muted)">
        <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent" />
        Sample offers matched to what you plan to spend. They are examples, not live deals, and nothing counts as saved until you use one.
      </p>
      {ranked.length === 0 && <p className="text-sm text-(--c-muted)">No sample offers match your plan yet.</p>}
      <ul className="flex flex-col gap-3">
        {ranked.map(({ offer, eligibleNow }, i) => (
          <li
            key={offer.id}
            className="pop rounded-[24px] border border-line bg-surface p-4 shadow-soft"
            style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-grad-positive px-3 py-1 text-xs font-bold"><IconBadge icon="deal" tone="onGradient" size="xs" className="!bg-transparent" />Sample offer</span>
              <span className="text-xs text-(--c-muted)"><WithIcon icon="checked" tone="neutral" size={12}>Checked {dayLabel(offer.checked)}</WithIcon></span>
            </div>
            <h3 className="mt-2 font-display text-lg font-bold">{offer.title}</h3>
            <p className="mt-2 flex items-center gap-2 rounded-2xl bg-grad-positive-soft px-3 py-2 text-sm">
              <IconBadge icon="savings" tone="positive" size="sm" solid />
              <span><span className="text-(--c-muted)">Potential saving:</span> <span className="font-bold text-pos">{offer.discountDescription}</span></span>
            </p>
            <dl className="mt-3 space-y-1.5 text-sm text-(--c-muted)">
              <div className="relative pl-7"><dt className="inline font-semibold text-(--c-text)"><IconBadge icon="eligibility" tone="primary" size="xs" className="absolute left-0 top-0" />Eligibility: </dt><dd className="inline">{offer.eligibility}{offer.membership && !eligibleNow ? ` Needs ${offer.membership} membership.` : ''}</dd></div>
              <div className="relative pl-7"><dt className="inline font-semibold text-(--c-text)"><IconBadge icon="conditions" tone="primary" size="xs" className="absolute left-0 top-0" />Conditions: </dt><dd className="inline">{offer.conditions}</dd></div>
            </dl>
            <a
              href={offer.source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-4"
            >
              <ExternalLink aria-hidden="true" size={14} />Source<span className="sr-only"> for {offer.title} (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
