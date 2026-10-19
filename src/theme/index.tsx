import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import type { Theme } from '@/data/types';

const ThemeContext = createContext<Theme | null>(null);
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const style = {
    '--venue-ink': theme.ink, '--venue-paper': theme.paper, '--venue-accent': theme.accent,
    '--venue-accent-soft': theme.accentSoft, '--venue-stamp-filled': theme.stampFilled,
    '--venue-stamp-empty': theme.stampEmpty, '--venue-radius': `${theme.radius}px`,
    '--venue-heading-font': `"${theme.headingFont}", system-ui, sans-serif`, '--venue-body-font': `"${theme.bodyFont}", system-ui, sans-serif`,
  } as CSSProperties;
  return <ThemeContext.Provider value={theme}><div className="venue-theme" style={style}>{children}</div></ThemeContext.Provider>;
}
export const useVenueTheme = () => useContext(ThemeContext);

export function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const rgb = hex.replace('#', '').match(/.{2}/g)?.map(value => parseInt(value, 16) / 255) ?? [0, 0, 0];
    const [r, g, b] = rgb.map(value => { const channel = value!; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

export function themeHasAccessibleContrast(theme: Theme) {
  return contrastRatio(theme.ink, theme.paper) >= 4.5;
}
