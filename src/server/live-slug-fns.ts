import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server function and helper that send a guest from an old page address to the current one (D26).

export const resolveSlugRedirectFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(60) }))
  .handler(async ({ data }) => {
    const { resolveSlugRedirect } = await import("./live-slug");
    return { slug: await resolveSlugRedirect(data.slug) };
  });

/**
 * Call from a public page loader when the page for `slug` was not found. When the address used to belong to
 * a restaurant that has moved, this throws a permanent redirect to the same page on the new address.
 * Otherwise it returns, and the page shows its usual "not found" view.
 */
export async function followSlugRedirect(
  slug: string,
  to: "/r/$slug" | "/r/$slug/join" | "/r/$slug/card",
  search?: Record<string, unknown>,
): Promise<void> {
  const { slug: next } = await resolveSlugRedirectFn({ data: { slug } });
  if (!next) return;
  throw redirect({ to, params: { slug: next }, ...(search && Object.keys(search).length ? { search } : {}), statusCode: 301 });
}
