import type { SpinSegment } from "@/data/types";

const WHEEL_COLORS = [
  "oklch(0.72 0.13 38)",
  "oklch(0.8 0.1 86)",
  "oklch(0.72 0.09 148)",
  "oklch(0.7 0.1 244)",
  "oklch(0.72 0.1 318)",
  "oklch(0.82 0.08 52)",
];

export interface WheelArc {
  segment: SpinSegment;
  start: number;
  end: number;
  color: string;
}

/**
 * Arcs for a wheel drawn from the prize list, in the order the owner wrote it.
 * Prizes without a name or without a weight cannot be won, so they are left
 * out of both the picture and the draw.
 */
export function wheelArcs(segments: ReadonlyArray<SpinSegment>): WheelArc[] {
  const usable = segments.filter(
    (segment) => segment.label.trim().length > 0 && segment.weight > 0,
  );
  const total = usable.reduce((sum, segment) => sum + segment.weight, 0);
  if (total <= 0) return [];
  let cursor = 0;
  return usable.map((segment, index) => {
    const start = cursor;
    cursor += (segment.weight / total) * 360;
    return { segment, start, end: cursor, color: WHEEL_COLORS[index % WHEEL_COLORS.length]! };
  });
}

/** The share of the wheel a prize holds, shown to the owner as a chance. */
export function arcShare(arc: WheelArc, arcs: ReadonlyArray<WheelArc>): number {
  const total = arcs.reduce((sum, item) => sum + item.segment.weight, 0);
  return total > 0 ? Math.round((arc.segment.weight / total) * 100) : 0;
}

/** Plain-language odds for one prize, such as "about 1 in 10". */
export function oddsInWords(weight: number, segments: ReadonlyArray<SpinSegment>): string {
  const total = segments
    .filter((segment) => segment.label.trim().length > 0 && segment.weight > 0)
    .reduce((sum, segment) => sum + segment.weight, 0);
  if (total <= 0 || weight <= 0) return "never on this wheel";
  const oneIn = Math.max(1, Math.round(total / weight));
  return oneIn === 1 ? "every spin" : `about 1 in ${oneIn}`;
}

/**
 * A warning for the owner when the prize weights cannot make a draw: nothing
 * has a positive weight, or some weighted prizes have no name and are skipped.
 */
export function weightWarning(segments: ReadonlyArray<SpinSegment>): string | null {
  const weighted = segments.filter((segment) => segment.weight > 0);
  if (weighted.length === 0) return "No prize has a chance yet. Give at least one prize a weight above 0.";
  const unnamed = weighted.filter((segment) => segment.label.trim().length === 0);
  if (unnamed.length > 0) {
    return "A prize with a chance has no name, so it is left off the wheel. Name it or set its chance to 0.";
  }
  return null;
}

/** Shortens a long prize name for the wheel; the full name stays in the result card. */
export function shortWheelLabel(label: string, max = 14): string {
  const clean = label.trim();
  if (clean.length <= max) return clean;
  const words = clean.split(/\s+/);
  let out = "";
  for (const word of words) {
    if ((out + " " + word).trim().length > max - 1) break;
    out = (out + " " + word).trim();
  }
  return `${out || clean.slice(0, max - 1)}…`;
}

/** Longest line a wheel label may take, so two lines still fit a slice. */
export const WHEEL_LINE_MAX = 14;

/**
 * A prize name on the wheel wraps onto at most two lines, split at a space
 * near the middle and each line no longer than WHEEL_LINE_MAX. Only a name
 * that still does not fit in two lines is cut with "...". The segment count
 * is passed in so a crowded wheel can reuse the same helper.
 */
export function wheelLabelLines(label: string, segmentCount: number): string[] {
  void segmentCount;
  const clean = label.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  if (clean.length <= WHEEL_LINE_MAX) return [clean];
  const words = clean.split(" ");
  let best: [string, string] | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    if (left.length > WHEEL_LINE_MAX || right.length > WHEEL_LINE_MAX) continue;
    const gap = Math.abs(left.length - right.length);
    if (gap < bestGap) {
      bestGap = gap;
      best = [left, right];
    }
  }
  if (best) return best;
  const firstWords: string[] = [];
  for (const word of words) {
    if ([...firstWords, word].join(" ").length > WHEEL_LINE_MAX) break;
    firstWords.push(word);
  }
  const first =
    firstWords.length > 0 ? firstWords.join(" ") : clean.slice(0, WHEEL_LINE_MAX);
  const rest =
    firstWords.length > 0
      ? words.slice(firstWords.length).join(" ")
      : clean.slice(WHEEL_LINE_MAX);
  if (rest.length <= WHEEL_LINE_MAX) return [first, rest];
  const cut = rest.slice(0, WHEEL_LINE_MAX - 3);
  const atSpace = cut.lastIndexOf(" ");
  const trimmed = atSpace > 0 ? cut.slice(0, atSpace) : cut;
  return [first, `${trimmed.trimEnd()}...`];
}
