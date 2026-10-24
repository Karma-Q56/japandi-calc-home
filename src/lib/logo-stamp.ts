import type { LogoStamp } from "@/data/types";

export const LOGO_STAMP_GRIDS = [24, 32] as const;
export const LOGO_MAX_BYTES = 300 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

export function validateLogoFile(file: File): string | null {
  if (!LOGO_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG or SVG file.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "That file is larger than 300 KB. Compress it and try again.";
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function nearestPaletteColor(
  red: number,
  green: number,
  blue: number,
  palette: Array<{ hex: string; rgb: [number, number, number] }>,
): string {
  let best = palette[0]!.hex;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    const [r, g, b] = entry.rgb;
    const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.hex;
    }
  }
  return best;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

function svgForCells(
  cells: Array<{ x: number; y: number; color: string; on: boolean }>,
  grid: number,
  emptyColor: string,
  filled: boolean,
): string {
  const rects = cells
    .map((cell) =>
      filled && cell.on
        ? `<rect x="${cell.x}" y="${cell.y}" width="1" height="1" fill="${cell.color}"/>`
        : filled
          ? ""
          : `<rect x="${cell.x}" y="${cell.y}" width="1" height="1" fill="${emptyColor}" fill-opacity="${cell.on ? 0.38 : 0.12}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" width="96" height="96" role="img">${rects}</svg>`;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Pixelate an uploaded logo to a small grid, quantize each cell to the venue
 * palette, and return filled + empty stamp art as tiny SVG data URLs.
 */
export async function buildLogoStamp(input: {
  file: File;
  grid: number;
  palette: { ink: string; accent: string; paper: string; stampEmpty: string };
}): Promise<LogoStamp> {
  const invalid = validateLogoFile(input.file);
  if (invalid) throw new Error(invalid);
  const grid = LOGO_STAMP_GRIDS.includes(input.grid as 24 | 32) ? input.grid : 24;
  const image = await loadImage(input.file);
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot process the logo.");
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, grid, grid);

  // Fit the logo inside the grid, centred, without stretching.
  const scale = Math.min(grid / image.width, grid / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, Math.floor((grid - width) / 2), Math.floor((grid - height) / 2), width, height);
  const pixels = context.getImageData(0, 0, grid, grid).data;

  const palette = [input.palette.ink, input.palette.accent, input.palette.paper].map((hex) => ({
    hex,
    rgb: hexToRgb(hex),
  }));
  const cells: Array<{ x: number; y: number; color: string; on: boolean }> = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const index = (y * grid + x) * 4;
      const alpha = pixels[index + 3] ?? 0;
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const on = alpha > 40 && luminance < 205;
      cells.push({
        x,
        y,
        color: nearestPaletteColor(red, green, blue, palette),
        on,
      });
    }
  }
  return {
    grid,
    filled: toDataUrl(svgForCells(cells, grid, input.palette.stampEmpty, true)),
    empty: toDataUrl(svgForCells(cells, grid, input.palette.stampEmpty, false)),
  };
}
