export { countLabel } from "./count-label";

/**
 * A whole-number phrase for how often a guest usually comes back.
 * Under two weeks we say days, otherwise whole weeks.
 * Examples: 1 -> "about every day", 5 -> "about every 5 days",
 * 14 -> "about every 2 weeks", 36.5 -> "about every 5 weeks".
 */
export function averageGapPhrase(days: number): string {
  const rounded = Math.max(1, Math.round(days));
  if (rounded === 1) return "about every day";
  if (rounded < 14) return `about every ${rounded} days`;
  const weeks = Math.max(2, Math.round(rounded / 7));
  return `about every ${weeks} weeks`;
}
