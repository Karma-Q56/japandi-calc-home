import { useId } from "react";

export type TrendPoint = { label: string; value: number };

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow * 4 >= value)! * pow;
  return Math.ceil(value / step) * step;
}

/**
 * A simple area chart with a y axis, day labels and a number on hover.
 * Plain SVG so it prints, scales and needs no chart library.
 */
export function TrendChart({
  points,
  format = (value: number) => String(value),
  label,
}: {
  points: TrendPoint[];
  format?: ((value: number) => string) | undefined;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const W = 640;
  const H = 220;
  const left = 44;
  const right = 24;
  const top = 12;
  const bottom = 28;
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const innerW = W - left - right;
  const innerH = H - top - bottom;
  const x = (i: number) =>
    left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => top + innerH - (v / max) * innerH;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${top + innerH} L${x(0).toFixed(1)},${top + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={W - right} y1={y(tick)} y2={y(tick)} className="trend-grid" />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="trend-axis">
            {format(Math.round(tick))}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} className="trend-line" fill="none" />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle
            cx={x(i)}
            cy={y(p.value)}
            r={points.length > 16 ? 2.5 : 3.5}
            className="trend-dot"
          />
          <circle cx={x(i)} cy={y(p.value)} r={12} fill="transparent">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="trend-axis">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
