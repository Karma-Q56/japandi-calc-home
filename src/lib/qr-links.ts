/** Every printed QR points at the same join page, tagged with where it sits. */
export function joinUrl(origin: string, slug: string, source: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/r/${encodeURIComponent(slug)}/join?src=${encodeURIComponent(source)}`;
}
