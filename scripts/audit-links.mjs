#!/usr/bin/env node
// Internal link audit CLI. Walks every source file under src/, collects
// href="..." and TanStack to="..." targets, and flags anything that does not
// match a route from the generated route tree. Run with: node scripts/audit-links.mjs
// Exit code 1 when there is at least one finding, so CI can fail on it.

import { runAudit } from "./link-audit.mjs";

const report = runAudit(process.cwd());
console.log(`Checked ${report.checked} internal link targets across ${report.routeCount} known routes.`);
if (report.violations.length === 0) {
  console.log("All internal links resolve.");
} else {
  for (const finding of report.violations) {
    console.log(`${finding.file}:${finding.line}: ${finding.href} (${finding.reason})`);
  }
  console.log(`${report.violations.length} finding(s). Fix the link or add the route.`);
  process.exitCode = 1;
}
