import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { logoBox, makeQrMatrix, qrSvg } from "./qr";

const origin = "https://patron.demo";

function sampleUrls(): string[] {
  const slugs = ["daily-grind", "sunrise-bakes", "oak-table"];
  const urls: string[] = [];
  for (const slug of slugs) {
    urls.push(`${origin}/r/${slug}/join`);
    urls.push(`${origin}/r/${slug}/join?src=table-12`);
    urls.push(`${origin}/r/${slug}/card`);
  }
  for (let table = 1; table <= 5; table++) {
    urls.push(`${origin}/r/daily-grind/join?src=table-${table}`);
  }
  urls.push(`${origin}/s/demo-token-0001`);
  urls.push(`${origin}/s/demo-token-0001?src=table-12`);
  urls.push(`${origin}/u/demo-opt-out-token-value-0001`);
  urls.push(`${origin}/r/daily-grind/join?src=table-12&campaign=tuesday`);
  urls.push(`${origin}/r/sunrise-bakes/join?src=table-12&campaign=tuesday`);
  urls.push(`${origin}/r/oak-table/join?src=table-12`);
  return urls.slice(0, 20);
}

// Longest join link a slug can produce: a 40 character slug and a long source tag.
function longestJoinUrl(): string {
  const slug = "a".repeat(20) + "-" + "b".repeat(19);
  return `${origin}/r/${slug}/join?src=${"table-".padEnd(60, "x")}`;
}

// Draws the modules to pixels with a quiet zone, optionally blanking the logo box.
function renderPixels(matrix: boolean[][], blankLogo: boolean, scale = 8) {
  const quiet = 4;
  const count = matrix.length;
  const size = (count + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  const box = logoBox(count);
  const inLogo = (x: number, y: number) =>
    blankLogo &&
    x >= box.backing.x &&
    x < box.backing.x + box.backing.size &&
    y >= box.backing.y &&
    y < box.backing.y + box.backing.size;
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      const dark = matrix[y]![x]! && !inLogo(x, y);
      const fill = inLogo(x, y) ? 255 : dark ? 0 : 255;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx;
          const i = px * 4;
          data[i] = data[i + 1] = data[i + 2] = fill;
          data[i + 3] = 255;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

function decode(matrix: boolean[][], blankLogo = false) {
  const { data, width, height } = renderPixels(matrix, blankLogo);
  return jsQR(data, width, height)?.data ?? null;
}

describe("demo QR encoder", () => {
  it("encodes every sample join/member URL at level M and decodes it back", () => {
    for (const url of sampleUrls()) {
      expect(decode(makeQrMatrix(url, "M")), url).toBe(url);
    }
  });

  it("decodes the longest join link with a logo in the centre at level H", () => {
    const url = longestJoinUrl();
    const matrix = makeQrMatrix(url, "H");
    expect(decode(matrix, true), url).toBe(url);
  });

  it("keeps the logo box no wider than 18 percent of the code", () => {
    const count = makeQrMatrix(longestJoinUrl(), "H").length;
    const box = logoBox(count);
    expect(box.logo.size / count).toBeLessThanOrEqual(0.18);
  });

  it("writes an SVG with the logo layer only when a logo is given", () => {
    const plain = qrSvg(sampleUrls()[0]!);
    expect(plain).not.toContain("<image");
    const withLogo = qrSvg(sampleUrls()[0]!, "#1f3027", "#ffffff", {
      href: "data:image/png;base64,AAAA",
    });
    expect(withLogo).toContain("<image");
  });
});
