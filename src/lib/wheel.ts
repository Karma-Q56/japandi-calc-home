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

/** Wheel label sizes, in SVG units. The wheel has a radius of 100. */
export const WHEEL_FONT_MAX = 9;
export const WHEEL_FONT_MIN = 7;
export const WHEEL_MAX_LINES = 3;
export const WHEEL_LINE_HEIGHT = 1.12;
/** From this many prizes the whole wheel uses the small font. */
export const WHEEL_CROWDED_AT = 8;
/** Prize names run from the hub to the rim, so this is the room one line has. */
export const WHEEL_TEXT_LENGTH = 73;
/** Rough width of one letter as a share of the font size, on the safe side. */
const LETTER_WIDTH = 0.57;
/** How far from the middle the room across a slice is measured. */
const NARROW_RADIUS = 45;

export interface WheelLabel {
  lines: string[];
  fontSize: number;
  /** True when the name did not fit and ends in "...". The full name is listed under the wheel. */
  cut: boolean;
}

export function wheelLineChars(fontSize: number): number {
  return Math.floor(WHEEL_TEXT_LENGTH / (fontSize * LETTER_WIDTH));
}

/** Puts whole words onto lines no longer than max. A longer word gets a line of its own. */
function wrapWords(words: string[], max: number): string[] {
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else lines.push(word);
  }
  return lines;
}

function cutLines(lines: string[], maxLines: number, max: number): string[] {
  const kept: string[] = [];
  for (let index = 0; index < lines.length && kept.length < maxLines; index += 1) {
    const line = lines[index]!;
    const isLast = kept.length === maxLines - 1 || line.length > max;
    if (!isLast) {
      kept.push(line);
      continue;
    }
    // Drop whole words until "..." fits. One very long word has to be cut inside.
    let text = line;
    while (text.length > max - 3 && text.includes(" ")) {
      text = text.slice(0, text.lastIndexOf(" "));
    }
    kept.push(`${text.slice(0, max - 3).trimEnd()}...`);
    break;
  }
  return kept;
}

/**
 * Fits a prize name into its slice: up to three lines, shrinking the font down to
 * WHEEL_FONT_MIN, and only then cutting at a word with "...". A slice too thin for
 * even one line gets no words on the wheel (the list under the wheel names it).
 */
export function wheelLabel(label: string, segmentCount: number, spanDegrees: number): WheelLabel {
  const clean = label.trim().replace(/\s+/g, " ");
  const start = segmentCount >= WHEEL_CROWDED_AT ? WHEEL_FONT_MIN : WHEEL_FONT_MAX;
  if (!clean) return { lines: [], fontSize: start, cut: false };
  const across = 2 * NARROW_RADIUS * Math.sin((Math.min(spanDegrees, 180) * Math.PI) / 360);
  const linesFor = (fontSize: number) =>
    Math.min(WHEEL_MAX_LINES, Math.floor(across / (fontSize * WHEEL_LINE_HEIGHT)));
  const words = clean.split(" ");
  for (let fontSize = start; fontSize >= WHEEL_FONT_MIN; fontSize -= 0.5) {
    const max = wheelLineChars(fontSize);
    const lines = wrapWords(words, max);
    if (lines.length <= linesFor(fontSize) && lines.every((line) => line.length <= max)) {
      return { lines, fontSize, cut: false };
    }
  }
  const max = wheelLineChars(WHEEL_FONT_MIN);
  const room = linesFor(WHEEL_FONT_MIN);
  if (room < 1) return { lines: [], fontSize: WHEEL_FONT_MIN, cut: true };
  return {
    lines: cutLines(wrapWords(words, max), room, max),
    fontSize: WHEEL_FONT_MIN,
    cut: true,
  };
}
