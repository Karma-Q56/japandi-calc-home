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

/**
 * The colour for words that sit on the accent colour (buttons and the card badge).
 * The paper colour is kept when it can be read, so good designs look as before. Otherwise
 * white or the text colour is used, and black as a last resort. One of white and black
 * always reaches 4.5:1.
 */
export function readableOnAccent(accent: string, ink: string, paper: string): string {
  const choices = [paper, '#ffffff', ink, '#000000'];
  return choices.find((colour) => contrastRatio(colour, accent) >= 4.5) ?? '#000000';
}

/** Darkens a colour until white words on it can be read. */
export function darkenForWhiteText(colour: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) return '#171310';
  let [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)) as [number, number, number];
  const hex = () => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  while (contrastRatio('#ffffff', hex()) < 4.5) {
    [r, g, b] = [r, g, b].map((v) => Math.floor(v * 0.9)) as [number, number, number];
  }
  return hex();
}
