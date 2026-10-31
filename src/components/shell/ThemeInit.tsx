'use client';
import { useEffect } from 'react';
import { readTheme } from './theme';

/** Applies the saved theme after hydration (light is the CSS default). */
export function ThemeInit() {
  useEffect(() => {
    document.documentElement.dataset.theme = readTheme();
  }, []);
  return null;
}
