/** Bubble effect for changed day cells and chips. Only transform, box-shadow halo and opacity animate. */
export interface BubbleOptions {
  /** Stagger delay in ms (contract: 40ms per day, capped at 400). */
  delayMs?: number;
}

const HALO = 'rgb(200 245 60 / 0.35)';
const NONE = 'rgb(200 245 60 / 0)';

export function bubbleDelay(index: number): number {
  return Math.min(Math.max(index, 0) * 40, 400);
}

export function playBubble(el: HTMLElement | null | undefined, opts: BubbleOptions = {}): Animation | null {
  if (!el || typeof el.animate !== 'function') return null;
  const delay = Math.min(Math.max(opts.delayMs ?? 0, 0), 400);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    return el.animate(
      [
        { boxShadow: '0 0 0 3px #c8f53c', opacity: 1, offset: 0 },
        { boxShadow: '0 0 0 3px #c8f53c', opacity: 1, offset: 0.8 },
        { boxShadow: '0 0 0 3px rgb(200 245 60 / 0)', opacity: 1, offset: 1 },
      ],
      { duration: 1200, delay, fill: 'none', easing: 'linear' },
    );
  }
  // 180ms up, 320ms hold (number counts), 260ms settle = 760ms total.
  return el.animate(
    [
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${NONE}`, offset: 0 },
      { transform: 'scale(1.06)', boxShadow: `0 0 0 6px ${HALO}`, offset: 180 / 760, easing: 'ease-out' },
      { transform: 'scale(1.06)', boxShadow: `0 0 0 6px ${HALO}`, offset: 500 / 760 },
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${NONE}`, offset: 1 },
    ],
    { duration: 760, delay, fill: 'none', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}
