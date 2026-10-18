import { createFileRoute } from "@tanstack/react-router";

function cronSecret(): string | undefined {
  return (process.env as Record<string, string | undefined>)["CRON_SECRET"];
}

export const Route = createFileRoute("/api/cron/settle")({
  component: CronSettlePlaceholder,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = cronSecret();
        if (expected && request.headers.get("x-cron-secret") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Same story as /api/cron/dispatch: settleCampaign() runs against the
        // browser demo state (settle from the campaign results page). M9
        // connects this route to the real database behind CRON_SECRET.
        return new Response("Demo mode: settle from the campaign results page.", { status: 501 });
      },
    },
  },
});

function CronSettlePlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>SMS cost settlement runs from the campaign results page until M9.</p>
      <a href="/demo">Back to demo hub</a>
    </main>
  );
}
