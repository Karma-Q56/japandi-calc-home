import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/server/cron-auth";
import { runLiveDispatch } from "@/server/live-dispatch";

type Env = Record<string, string | undefined>;

export const Route = createFileRoute("/api/cron/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = process.env as Env;
        if (!cronAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
        const databaseUrl = env["DATABASE_URL"];
        if (!databaseUrl) return new Response("Not configured", { status: 503 });
        try {
          const result = await runLiveDispatch(databaseUrl, env);
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch {
          // Log nothing sensitive: the driver error can include message text.
          return new Response("Dispatch failed", { status: 500 });
        }
      },
    },
  },
});
