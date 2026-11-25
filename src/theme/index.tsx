import { type CSSProperties, type ReactNode } from 'react';
import type { Theme } from '@/data/types';

import { ThemeContext } from './venue-theme-context';
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const style = {
    '--venue-ink': theme.ink, '--venue-paper': theme.paper, '--venue-accent': theme.accent,
    '--venue-accent-soft': theme.accentSoft, '--venue-stamp-filled': theme.stampFilled,
    '--venue-stamp-empty': theme.stampEmpty, '--venue-radius': `${theme.radius}px`,
    '--venue-heading-font': `"${theme.headingFont}", system-ui, sans-serif`, '--venue-body-font': `"${theme.bodyFont}", system-ui, sans-serif`,
  } as CSSProperties;
  return <ThemeContext.Provider value={theme}><div className="venue-theme" style={style}>{children}</div></ThemeContext.Provider>;
}
