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
