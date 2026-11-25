import type { Theme } from '@/data/types';

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
