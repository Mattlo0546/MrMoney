'use client';
import { getAppStore } from '@/lib/store';
import { resetChat, startDemoLocal } from '@/components/chat/chatStore';

export type ResetMode = 'onboarding' | 'demo';

/**
 * Resets the entire application state.
 *
 * - mode 'onboarding': clears all plan, chat, itinerary, and projections data,
 *   returning the user to the clean onboarding chat flow.
 * - mode 'demo': clears previous state and immediately loads the demo student plan.
 */
export function resetApp(mode: ResetMode = 'onboarding') {
  if (typeof window !== 'undefined') {
    const theme = window.localStorage.getItem('mrmoney.theme.v1');
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith('mrmoney') || k.startsWith('studentplan')) {
        window.localStorage.removeItem(k);
      }
    }
    if (theme) {
      window.localStorage.setItem('mrmoney.theme.v1', theme);
    }
  }

  resetChat();
  const store = getAppStore();
  store.reset();

  if (mode === 'demo') {
    startDemoLocal();
  }
}
