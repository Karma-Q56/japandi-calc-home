import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditFiles, collectLinkTargets, isKnownPath, runAudit } from "../../scripts/link-audit.mjs";

describe("link audit library", () => {
  it("accepts dynamic route matches and rejects strangers", () => {
    const routes = new Set(["/", "/blog/$slug", "/app/customers/$customerId"]);
    expect(isKnownPath(routes, "/blog/why-the-card-still-works")).toBe(true);
    expect(isKnownPath(routes, "/app/customers/cust-1")).toBe(true);
    expect(isKnownPath(routes, "/nope")).toBe(false);
    expect(isKnownPath(routes, "/blog/a/b")).toBe(false);
  });

  it("strips query strings and hashes before matching", () => {
    const routes = new Set(["/contact"]);
    expect(isKnownPath(routes, "/contact?kind=diner")).toBe(true);
    expect(isKnownPath(routes, "/contact#visit")).toBe(true);
  });

  it("collects hrefs and link targets without false anchors", () => {
    const live = [
      '<a href="/blog">Notes</a>',
      '<a href="#">Top</a>',
      '<Link to="/find" />',
      '<Link to="$slug" />',
    ].join("\n");
    const targets = collectLinkTargets(live).map((item: { href: string }) => item.href);
    expect(targets).toEqual(["/blog", "/find"]);
  });

  it("flags a dead link when one exists", () => {
    const report = auditFiles(
      [{ path: "sample.tsx", content: '<a href="/not-a-page">Gone</a>' }],
      new Set(["/"]),
    );
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.href).toBe("/not-a-page");
  });
});

describe("link audit over the repo", () => {
  // The generated route tree must exist first; run a build before this suite
  // if it is missing.
  const genPath = path.join(process.cwd(), "src", "routeTree.gen.ts");
  it("finds the generated route tree", () => {
    expect(fs.existsSync(genPath)).toBe(true);
  });

  it.runIf(fs.existsSync(genPath))("reports no dead internal links in src", () => {
    const report = runAudit(process.cwd());
    expect(report.checked).toBeGreaterThan(50);
    const findings: string[] = report.violations.map(
      (finding: { file: string; line: number; href: string }) => `${finding.file}:${finding.line} ${finding.href}`,
    );
    expect(report.violations, findings.join("\n")).toEqual([]);
  });
});
