import { createFileRoute } from "@tanstack/react-router";

function cronSecret(): string | undefined {
  return (process.env as Record<string, string | undefined>)["CRON_SECRET"];
}

export const Route = createFileRoute("/api/cron/dispatch")({
  component: CronDispatchPlaceholder,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = cronSecret();
        if (expected && request.headers.get("x-cron-secret") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Demo mode keeps its state in the browser, so there is nothing to
        // dispatch here. Run the same dispatchBatch() function from the
        // "Run dispatcher" button on /demo/outbox instead. M9 connects this
        // route to the real database behind the same CRON_SECRET check.
        return new Response("Demo mode: run the dispatcher from /demo/outbox.", { status: 501 });
      },
    },
  },
});

function CronDispatchPlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>Queued SMS dispatch runs from the demo outbox until M9.</p>
      <a href="/demo">Back to demo hub</a>
    </main>
  );
}
