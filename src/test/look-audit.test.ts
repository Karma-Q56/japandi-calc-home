import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** D28 item 1: new buttons must be given a look, and never change their words while saving. */

const root = join(process.cwd(), "src");
// The shared kit and ui folders set the look themselves.
const SHARED = [join("components", "ui") + sep, join("components", "patron", "kit") + sep];

function tsxFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [full] : [];
  });
}

/** Every opening <button ...> tag with the line it starts on. */
function buttonTags(source: string): Array<{ tag: string; line: number }> {
  const found: Array<{ tag: string; line: number }> = [];
  for (const match of source.matchAll(/<button\b/g)) {
    let depth = 0;
    let quote = "";
    let at = match.index + match[0].length;
    for (; at < source.length; at += 1) {
      const char = source[at]!;
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    found.push({
      tag: source.slice(match.index, at + 1),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

const files = tsxFiles(root)
  .map((path) => ({ name: relative(root, path), source: readFileSync(path, "utf8") }))
  .filter(({ name }) => !name.startsWith(`test${sep}`));

describe("button look rules", () => {
  it("reads a tag with arrows and braces inside it", () => {
    const [only] = buttonTags('<button onClick={() => a > b} className="x">Go</button>');
    expect(only!.tag).toBe('<button onClick={() => a > b} className="x">');
  });

  it("gives every button a class", () => {
    const bare = files
      .filter(({ name }) => !SHARED.some((folder) => name.startsWith(folder)))
      .flatMap(({ name, source }) =>
        buttonTags(source)
          .filter(({ tag }) => !/\bclassName=/.test(tag))
          .map(({ line }) => `src/${name}:${line}`),
      );
    expect(bare, "give these buttons a class from the rules at the top of kit.css").toEqual([]);
  });

  it("never swaps a label for a status while busy", () => {
    const swapping = files.flatMap(({ name, source }) =>
      source
        .split("\n")
        .map((text, index) => ({ text, line: index + 1 }))
        .filter(({ text }) =>
          /(busy|saving|sending|pending|working)\w*\s*\?\s*["'`][A-Z]/i.test(text),
        )
        .map(({ line }) => `src/${name}:${line}`),
    );
    expect(swapping).toEqual([]);
  });
});
