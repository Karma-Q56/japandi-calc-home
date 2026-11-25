import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Public logo for a restaurant's page (live mode). Only active restaurants have a readable logo.
// A versioned URL (?v=<version>) can be cached for a long time because a new upload changes it.

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40);

export const Route = createFileRoute("/r/$slug/logo")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = slugSchema.safeParse(params.slug);
        if (!slug.success) return new Response("Not found", { status: 404 });
        const { readPublicLogo } = await import("@/server/live-logo");
        const logo = await readPublicLogo(slug.data);
        if (!logo) {
          // An old address goes to the new one, so a logo link printed or saved earlier still works.
          const { resolveSlugRedirect } = await import("@/server/live-slug");
          const next = await resolveSlugRedirect(slug.data).catch(() => null);
          if (next) {
            const search = new URL(request.url).search;
            return new Response(null, { status: 301, headers: { Location: `/r/${next}/logo${search}` } });
          }
          return new Response("Not found", { status: 404 });
        }
        const version = new URL(request.url).searchParams.get("v");
        const cache =
          version !== null && version === String(logo.version)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=0, must-revalidate";
        return new Response(new Uint8Array(logo.png), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": cache,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
