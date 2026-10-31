/** Bubble effect for changed cells/chips (contract: scale + lime halo, staggered 40ms, 400ms cap). */
import { bubbleDelay, playBubble } from '@/components/ui/bubble';

/** `rippleMs`: stagger the days in date order by this much each (capped at ~1.4s) instead of the default 40ms/400ms. */
export function playBubbles(root: HTMLElement, days: string[], items: string[], rippleMs?: number): void {
  const targets: HTMLElement[] = [];
  const esc = (s: string) => s.replace(/"/g, '\\"');
  for (const d of rippleMs ? [...days].sort() : days) root.querySelectorAll<HTMLElement>(`[data-day="${esc(d)}"]`).forEach((e) => targets.push(e));
  for (const k of items) root.querySelectorAll<HTMLElement>(`[data-item="${esc(k)}"]`).forEach((e) => targets.push(e));
  if (rippleMs) {
    const step = Math.min(rippleMs, 1400 / Math.max(1, targets.length));
    targets.forEach((el, i) => playBubble(el, { delayMs: i * step, maxDelayMs: 1400 }));
    return;
  }
  targets.forEach((el, i) => playBubble(el, { delayMs: bubbleDelay(i) }));
}
