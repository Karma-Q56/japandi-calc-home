import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { checkDatabase } from "@/server/db";

export const Route = createFileRoute("/healthz/db")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const databaseUrl = (env as { DATABASE_URL?: string }).DATABASE_URL;
          if (!databaseUrl) {
            return Response.json({ status: "unavailable" }, { status: 503 });
          }
          const ok = await checkDatabase(databaseUrl);
          return Response.json({ status: ok === 1 ? "ok" : "unavailable" }, {
            status: ok === 1 ? 200 : 503,
          });
        } catch {
          return Response.json({ status: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
