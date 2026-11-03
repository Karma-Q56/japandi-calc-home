export interface LinkFinding {
  file: string;
  line: number;
  href: string;
  reason: string;
}

export interface AuditReport {
  checked: number;
  violations: LinkFinding[];
  routeCount?: number;
}

export function collectRoutesFromGenerated(genSource: string): Set<string>;
export function stripQueryAndHash(href: string): string;
export function isKnownPath(routes: Set<string>, pathname: string | undefined | null): boolean;
export function collectLinkTargets(source: string): Array<{ href: string; line: number }>;
export function auditFiles(
  files: Array<{ path: string; content: string }>,
  routes: Set<string>,
): AuditReport;
export function listSourceFiles(rootDir: string, subdir: string): string[];
export function runAudit(rootDir: string): AuditReport & { routeCount: number };
