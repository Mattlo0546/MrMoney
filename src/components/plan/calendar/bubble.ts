/** Bubble effect for changed cells/chips (contract: scale + lime halo, staggered 40ms, 400ms cap). */
import { bubbleDelay, playBubble } from '@/components/ui/bubble';

export function playBubbles(root: HTMLElement, days: string[], items: string[]): void {
  const targets: HTMLElement[] = [];
  const esc = (s: string) => s.replace(/"/g, '\\"');
  for (const d of days) root.querySelectorAll<HTMLElement>(`[data-day="${esc(d)}"]`).forEach((e) => targets.push(e));
  for (const k of items) root.querySelectorAll<HTMLElement>(`[data-item="${esc(k)}"]`).forEach((e) => targets.push(e));
  targets.forEach((el, i) => playBubble(el, { delayMs: bubbleDelay(i) }));
}
