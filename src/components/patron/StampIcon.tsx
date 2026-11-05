import type { Theme } from "@/data/types";

type Shape = Theme["stampShape"];

/** Glyphs are drawn on a 24x24 grid, stroke only, so they inherit `currentColor`. */
export function StampGlyph({ shape, size = 22 }: { shape: Shape; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (shape) {
    case "coffee-cup":
      return (
        <svg {...common}>
          <path d="M5 10h11v4.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5V10Z" />
          <path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16" />
          <path d="M8 3.5c-.9 1 .9 1.8 0 3M12 3.5c-.9 1 .9 1.8 0 3" />
        </svg>
      );
    case "croissant":
      return (
        <svg {...common}>
          <path d="M3 17.5C3.800 10 7.500 5.500 12 5.500s8.200 4.500 9 12c-1.600.7-2.900.3-3.900-1-.9 1.300-2.200 1.600-3.300.6-.5.600-1.200 1-1.800 1s-1.300-.4-1.800-1c-1.100 1-2.400.7-3.300-.6-1 1.300-2.300 1.700-3.900 1Z" />
          <path d="M9.200 7.200 8 15.600M14.800 7.200 16 15.600M12 5.800v9.500" />
        </svg>
      );
    case "pixel-star":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2.800 14.700 8.800l6.500.7-4.900 4.400 1.400 6.400L12 17l-5.700 3.300 1.400-6.400L2.800 9.500l6.500-.7L12 2.800Z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
        </svg>
      );
    case "leaf":
      return (
        <svg {...common}>
          <path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15Z" />
          <path d="M5 19 13 11" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
        </svg>
      );
    case "bean":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="6.500" ry="8.500" transform="rotate(-25 12 12)" />
          <path d="M8.500 15.500c2.200-2.200 4.800-4.800 7-7" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 21c-3.600 0-6-2.400-6-5.800 0-3.400 2.600-5.200 3.600-8.200.6 2 1.600 3 2.800 3.600C12.300 8.300 12.500 5.800 11.500 3c3.800 2.200 6.500 5.800 6.500 10.200 0 3.600-2.400 7.800-6 7.800Z" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M6 4h12l4 6-10 11L2 10l4-6Z" />
          <path d="M2 10h20M9 4l3 17 3-17" />
        </svg>
      );
    case "square":
      return (
        <svg {...common} strokeWidth={2.4}>
          <path d="m6 12.500 4 4 8-9" />
        </svg>
      );
    default:
      return (
        <svg {...common} strokeWidth={2.4}>
          <path d="m6.500 12.500 3.500 3.500 7.500-8" />
        </svg>
      );
  }
}

export function GiftGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M12 9v11M3 9h18M7.500 9a2.500 2.500 0 1 1 0-5C10 4 12 9 12 9s2-5 4.500-5a2.500 2.500 0 1 1 0 5" />
    </svg>
  );
}
