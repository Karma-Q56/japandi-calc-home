import fs from "node:fs";
import path from "node:path";

// Internal link audit. Flags hrefs and Link `to` targets that point at a
// route the generated route tree does not know. Imported both by
// scripts/audit-links.mjs (the CLI pass) and src/test/link-audit.test.ts
// (running in vitest), so the rules live in exactly one place.

export function collectRoutesFromGenerated(genSource) {
  const paths = new Set();
  for (const match of genSource.matchAll(/path:\s*'([^']*)'/g)) {
    const value = match[1];
    if (!value) continue;
    // The generator emits full paths such as '/blog/$slug'. Keep them as is.
    paths.add(value);
  }
  for (const match of genSource.matchAll(/fullPathsByPath\.(\S[^ ]*)\s*=\s*'([^']*)'/g)) {
    paths.add(`/${match[1].replace(/_/g, "/").replace(/\/$/, "")}`);
    paths.add(match[2]);
  }
  // The root and index routes show as "/.__root__" style ids rather than
  // clean paths, so derive bare names too.
  for (const match of genSource.matchAll(/fullPath:\s*'([^']*)'/g)) paths.add(match[1]);
  return paths;
}

export function stripQueryAndHash(href) {
  return href.split("#")[0].split("?")[0];
}

/** Segments of a template path, dropping empty ones. */
function segments(value) {
  return value.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

/**
 * Every dynamic segment in a known route (for example $slug) may be filled
 * with any single segment in the href. Everything static must match exactly.
 */
export function isKnownPath(routes, given) {
  if (!given || !given.startsWith("/")) return true; // anchors, mailto, tel and empty strings are checked elsewhere
  const pathname = stripQueryAndHash(given);
  const clean = pathname === "" ? "/" : pathname;
  for (const route of routes) {
    const routeSegs = segments(decodeURIComponent(route.replace(/\/\$\$/, "")));
    const hrefSegs = segments(clean);
    if (route === "/" ) {
      if (hrefSegs.length === 0) return true;
      continue;
    }
    if (routeSegs.length !== hrefSegs.length) continue;
    let ok = true;
    for (let i = 0; i < routeSegs.length; i++) {
      const rs = routeSegs[i];
      if (rs.startsWith("$") || rs === "_splat") continue;
      const hs = decodeURIComponent(hrefSegs[i]);
      if (rs.toLowerCase() !== hs.toLowerCase() && hs !== rs) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Extract internal link targets from one source file. */
export function collectLinkTargets(source) {
  const targets = [];
  const push = (href, index) => {
    const line = source.slice(0, index).split("\n").length;
    targets.push({ href, line });
  };
  for (const match of source.matchAll(/href\s*=\s*"([^"]*)"/g)) {
    if (match[1].startsWith("/")) push(match[1], match.index);
  }
  for (const match of source.matchAll(/href\s*=\s*\{\s*[`"']([^`"']*)/g)) {
    if (match[1].startsWith("/")) push(match[1], match.index);
  }
  for (const match of source.matchAll(/\bto\s*=\s*"([^"]*)"/g)) {
    if (match[1].startsWith("/") && !match[1].includes("$")) push(match[1], match.index);
  }
  return targets;
}

export function auditFiles(files, routes) {
  const violations = [];
  let checked = 0;
  for (const file of files) {
    for (const { href, line } of collectLinkTargets(file.content)) {
      checked += 1;
      const pathname = stripQueryAndHash(href);
      if (!isKnownPath(routes, pathname)) {
        violations.push({ file: file.path, line, href, reason: `no route for ${pathname}` });
      }
    }
  }
  return { checked, violations };
}

export function listSourceFiles(rootDir, subdir) {
  const dir = path.join(rootDir, subdir);
  const out = [];
  const walk = (base) => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(base, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export function runAudit(rootDir) {
  const genPath = path.join(rootDir, "src", "routeTree.gen.ts");
  const genSource = fs.readFileSync(genPath, "utf8");
  const routes = collectRoutesFromGenerated(genSource);
  const files = listSourceFiles(rootDir, "src").map((full) => ({
    path: path.relative(rootDir, full).split(path.sep).join("/"),
    content: fs.readFileSync(full, "utf8"),
  }));
  return { ...auditFiles(files, routes), routeCount: routes.size };
}
