import { useEffect, useState } from "react";
import { getLogoPreviewFn } from "@/server/live-logo-fns";

/**
 * The owner's own logo for previews. The public logo address only works once the page is published,
 * so the owner reads it through their session instead. Returns null while loading or when there is none.
 */
export function useLogoPreview(hasLogo: boolean): [string | null, (next: string | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!hasLogo) return;
    let cancelled = false;
    getLogoPreviewFn()
      .then((value) => {
        if (!cancelled) setUrl(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasLogo]);
  return [url, setUrl];
}
