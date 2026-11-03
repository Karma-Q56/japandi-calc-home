import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Owners and diners read plain words. These are developer words that must not
// reach a screen: not in visible text, not in a label, hint or button.
const BANNED = [
  "noun phrase",
  "tunnel",
  "snapshot",
  "payload",
  "idempotent",
  "enum",
  "slug",
  "token",
  "schema",
  "null",
  "undefined",
  "chars",
];

/** Props whose value is read by a person on a screen. */
const VISIBLE_PROPS = new Set([
  "label",
  "hint",
  "title",
  "placeholder",
  "intro",
  "eyebrow",
  "question",
  "confirmLabel",
  "empty",
  "aria-label",
  "caption",
]);

const ROOT = path.resolve(__dirname, "../..");
const FOLDERS = ["src/routes", "src/components"];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...collect(path.join(dir, entry.name)));
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Visible words only: JSX text and the words passed to display props. */
function visibleStrings(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const pushLiteral = (node: ts.Node | undefined) => {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.trim()) found.push(node.text);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, " ").trim();
      if (value) found.push(value);
    } else if (
      (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
      VISIBLE_PROPS.has(node.name.getText(source))
    ) {
      const init = node.initializer;
      if (init && ts.isJsxExpression(init)) pushLiteral(init.expression);
      else if (init) pushLiteral(init);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("plain language on screen", () => {
  it("never shows a developer word in a screen string", () => {
    const offenders: string[] = [];
    for (const folder of FOLDERS) {
      for (const file of collect(path.join(ROOT, folder))) {
        for (const value of visibleStrings(file)) {
          const lower = value.toLowerCase();
          for (const word of BANNED) {
            if (new RegExp(`\\b${word}\\b`).test(lower)) {
              offenders.push(`${path.relative(ROOT, file)}: "${value}" contains "${word}"`);
            }
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
