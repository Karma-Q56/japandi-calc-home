import { createFileRoute } from "@tanstack/react-router";

// Live Insights CSV download (D14). Counts and dates only, for the signed-in restaurant.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/api/reports/csv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        if (!DAY.test(from) || !DAY.test(to)) {
          return new Response("Pick a valid date range.", {
            status: 400,
            headers: { "Cache-Control": "private, no-store" },
          });
        }
        const [{ readViewer }, { buildInsightsCsv }] = await Promise.all([
          import("@/server/auth-viewer"),
          import("@/server/live-insights"),
        ]);
        const viewer = await readViewer();
        if (!viewer) {
          return new Response("Sign in again.", {
            status: 401,
            headers: { "Cache-Control": "private, no-store" },
          });
        }
        const result = await buildInsightsCsv(viewer, from, to);
        if (!result.ok) {
          return new Response(result.message, {
            status: result.status,
            headers: { "Cache-Control": "private, no-store" },
          });
        }
        return new Response(result.csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="insights-${from}-to-${to}.csv"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
