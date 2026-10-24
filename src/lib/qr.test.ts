import { describe, expect, it } from "vitest";
import { makeQrMatrix } from "./qr";

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

describe("demo QR encoder capacity", () => {
  it("encodes at least 20 join/member URLs within version 5-L", () => {
    const urls = sampleUrls();
    expect(urls.length).toBeGreaterThanOrEqual(20);
    for (const url of urls) {
      expect(
        () => makeQrMatrix(url),
        `QR link too long for the supported version 5-L: ${url}`,
      ).not.toThrow();
    }
  });
});
