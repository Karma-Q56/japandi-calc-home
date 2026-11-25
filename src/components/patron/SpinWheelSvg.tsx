import { useEffect, useId, useState } from "react";
import { prefersReducedMotion } from "@/components/patron/motion";
import type { SpinSegment } from "@/data/types";
import { WHEEL_LINE_HEIGHT, wheelArcs, wheelLabel, type WheelArc } from "@/lib/wheel";

/** Dark ink reads well on every colour in the wheel palette (all light tints). */
const LABEL_INK = "#2b2118";
const RADIUS = 100;
const SLOW_STOP_MS = 4200;
/** Middle of the room a name has, between the hub and the rim. */
const LABEL_RADIUS = 58;

function point(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: +(Math.sin(rad) * radius).toFixed(3), y: +(-Math.cos(rad) * radius).toFixed(3) };
}

function arcPath(arc: WheelArc) {
  const span = arc.end - arc.start;
  if (span >= 359.99) {
    return `M 0 ${-RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 0 ${RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 0 ${-RADIUS} Z`;
  }
  const a = point(arc.start, RADIUS);
  const b = point(arc.end, RADIUS);
  const large = span > 180 ? 1 : 0;
  return `M 0 0 L ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

/**
 * A wheel drawn from the prize list. The pointer sits at the top. The caller
 * passes the winning segment id, which was already decided on the server, and
 * the wheel turns to land on it with a slow stop. Reduced motion skips the turn.
 */
export function SpinWheelSvg({
  segments,
  winnerId,
  spinId,
  onSettled,
}: {
  segments: ReadonlyArray<SpinSegment>;
  winnerId?: string | null | undefined;
  spinId?: number | undefined;
  onSettled?: (() => void) | undefined;
}) {
  const arcs = wheelArcs(segments);
  const listId = useId();
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!winnerId || !spinId) return undefined;
    const arc = arcs.find((item) => item.segment.id === winnerId);
    if (!arc) {
      onSettled?.();
      return undefined;
    }
    const center = (arc.start + arc.end) / 2;
    const landing = (360 - (center % 360)) % 360;
    if (prefersReducedMotion()) {
      setRotation((current) => current - ((current % 360) + 360) % 360 + landing);
      onSettled?.();
      return undefined;
    }
    setAnimating(true);
    setRotation((current) => {
      const base = current - (((current % 360) + 360) % 360);
      return base + 5 * 360 + landing;
    });
    const timer = window.setTimeout(() => {
      setAnimating(false);
      onSettled?.();
    }, SLOW_STOP_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new spinId starts a new turn
  }, [spinId, winnerId]);

  if (arcs.length === 0) {
    return <p className="pv-meta">Add at least one prize with a name and a weight above zero to show the wheel.</p>;
  }

  return (
    <div className="pv-wheel">
      <div className="pv-wheel-stage">
        <span className="pv-wheel-pointer" aria-hidden="true" />
        <svg
          viewBox={`${-RADIUS} ${-RADIUS} ${RADIUS * 2} ${RADIUS * 2}`}
          className="pv-wheel-svg"
          aria-hidden="true"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: animating ? `transform ${SLOW_STOP_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)` : "none",
          }}
        >
          {arcs.map((arc) => {
            const mid = (arc.start + arc.end) / 2;
            const spot = point(mid, LABEL_RADIUS);
            const { lines, fontSize } = wheelLabel(
              arc.segment.label,
              arcs.length,
              arc.end - arc.start,
            );
            const lineHeight = fontSize * WHEEL_LINE_HEIGHT;
            const startY = spot.y - ((lines.length - 1) * lineHeight) / 2;
            // Names read along the spoke. The left half is turned round so it is never upside down.
            const turn = mid % 360 < 180 ? mid - 90 : mid + 90;
            return (
              <g key={arc.segment.id}>
                <title>{arc.segment.label}</title>
                <path d={arcPath(arc)} fill={arc.color} stroke="var(--card)" strokeWidth="1.5" />
                <text
                  x={spot.x}
                  y={startY}
                  fill={LABEL_INK}
                  fontSize={fontSize}
                  fontWeight="650"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${turn} ${spot.x} ${spot.y})`}
                >
                  {lines.map((line, index) => (
                    <tspan key={`${index}-${line}`} x={spot.x} dy={index === 0 ? 0 : lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
          <circle r="16" fill="var(--card)" stroke="var(--border)" strokeWidth="1" />
        </svg>
      </div>
      <div className="pv-wheel-prizes">
        <h4 id={listId}>Prizes on this wheel</h4>
        <ul aria-labelledby={listId}>
          {arcs.map((arc) => (
            <li key={arc.segment.id}>
              <span aria-hidden="true" style={{ background: arc.color }} />
              {arc.segment.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
