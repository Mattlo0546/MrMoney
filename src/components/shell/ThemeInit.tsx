'use client';
import { useEffect } from 'react';
import { readTheme } from './theme';

/** Applies the saved theme after hydration (dark is the CSS default). */
export function ThemeInit() {
  useEffect(() => {
    document.documentElement.dataset.theme = readTheme();
  }, []);
  return null;
}
