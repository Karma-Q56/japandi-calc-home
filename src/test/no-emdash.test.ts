// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The writing rule: no em dash (U+2014) anywhere. Every sentence gets a full
// stop, a comma or "and" instead, in pages, templates, seed data, docs and
// code comments alike.

const ROOT = path.resolve(__dirname, "../..");
const FOLDERS = ["src", "docs", "public"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);
const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...collectFiles(path.join(dir, entry.name)));
    } else if (
      entry.isFile() &&
      !BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

describe("Writing rules", () => {
  it(
    "uses no em dash (U+2014) in src, docs or public",
    { timeout: 60000 },
    () => {
      const offenders: string[] = [];
      for (const folder of FOLDERS) {
        const files = collectFiles(path.join(ROOT, folder));
        for (const file of files) {
          const text = readFileSync(file, "utf8");
          const index = text.indexOf("\u2014");
          if (index >= 0) {
            const line = text.slice(0, index).split("\n").length;
            offenders.push(`${path.relative(ROOT, file)} line ${line}`);
          }
        }
      }
      expect(offenders, `Em dashes found in: ${offenders.join(", ")}`).toEqual(
        [],
      );
    },
  );
});
