/**
 * A venue name is printed as it is, minus accidental repeated articles.
 * "The The Oak Table" becomes "The Oak Table".
 */
export function venueName(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return "this venue";
  const withoutArticles = clean.replace(/^(?:the\s+)+/i, "");
  return /^the\b/i.test(clean) ? `The ${withoutArticles}` : clean;
}

/** The same name with one article, for sentences like "Join the regulars at ...". */
export function theVenueName(value: string): string {
  const clean = venueName(value);
  return /^the\b/i.test(clean) ? clean : `the ${clean}`;
}
