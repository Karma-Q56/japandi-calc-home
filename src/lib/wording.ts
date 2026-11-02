export { countLabel } from "./count-label";

/**
 * First name plus the last initial, as owners see guests in every list.
 * "Thandi Mokoena" becomes "Thandi M.", and "Thandi M." stays as it is.
 */
export function guestDisplayName(name: string): string {
  const clean = name.trim();
  if (!clean) return "Guest";
  const [first, ...rest] = clean.split(/\s+/);
  if (!first || rest.length === 0) return first ?? "Guest";
  // Demo names sometimes end in a number ("Results Guest 1"). Take the
  // initial from the last word that actually has a letter, not the digit.
  const letterWord = [...rest].reverse().find((word) => /[A-Za-z]/.test(word));
  const initial = (letterWord ?? "").replace(/[^A-Za-z]/g, "").charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

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
