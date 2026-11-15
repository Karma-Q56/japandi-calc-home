import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/server/cron-auth";
import { runLiveSettle } from "@/server/live-settle";

type Env = Record<string, string | undefined>;

export const Route = createFileRoute("/api/cron/settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = process.env as Env;
        if (!cronAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
        const databaseUrl = env["DATABASE_URL"];
        if (!databaseUrl) return new Response("Not configured", { status: 503 });
        try {
          const result = await runLiveSettle(databaseUrl);
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return new Response("Settle failed", { status: 500 });
        }
      },
    },
  },
});
